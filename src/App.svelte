<script>
  document.title = "nostrpul.se";

  import { onMount, afterUpdate, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { writable } from "svelte/store";

  import Modal from "./Modal.svelte";

  import * as Tone from "tone";
  import ToneGenerator from "./tone";

  import { NostrFetcher } from "nostr-fetch";
  import { Relay, SimplePool } from "nostr-tools";

  import Masonry from "masonry-layout";

  let toneGenerator;

  import { generateBackground } from "./utils";

  const MONITOR =
    "9bbbb845e5b6c831c29789900769843ab43bb5047abe697870cb50b6fc9bf923";
  const ONLINE_THRESHOLD = Math.round(Date.now() / 1000) - 60 * 60 * 24;

  let currentRelayModal = null;
  let currentGenericModal = null;

  let RelaySocket;
  let RelayPool = new SimplePool();
  const relays = ["wss://relaypag.es", "wss://history.nostr.watch", "wss://relay.nostr.watch"];

  const k30066 = writable([]);
  const k30166 = writable([]);
  const loading30166 = writable(false);
  const event30166 = writable(null);
  let activeTab = writable(0); // Currently selected tab index
  let focusRelay = writable(null);

  let loading = true;
  let masonry;
  let initialSyncComplete = false;
  let since = ONLINE_THRESHOLD

  const newEvents = [];
  
  let eventRunner

  $: if ($activeTab) {
    event30166.set(null);
    const ev = get30166($focusRelay)
      .then((ev) => {
        event30166.set(ev);
        loading30166.set(false);
      })
      .catch(console.error);
  }

  // let currentRelayModal = null;

  function hideModals() {
    activeTab.set(0);
    focusRelay.set(null);
    event30166.set(null);
    hideGenericModal();
    hideRelayModal();
  }

  function showGenericModal(id) {
    currentGenericModal = id;
  }

  function hideGenericModal() {
    currentGenericModal = null;
  }

  function showRelayModal(ev) {
    focusRelay.set(getUrlFromEvent(ev));
    currentRelayModal = ev.id;
  }

  function hideRelayModal() {
    currentRelayModal = null;
  }

  function processEvent(event) {
    const dTag = event.tags.find((tag) => tag[0] === "d");
    if (!dTag) return null;

    return {
      ...event,
      dimension: calculateDimensions(event),
      backgroundColor: generateBackground(event),
      dTag: dTag[1],
    };
  }

  const updateEvents = (processedEvent) => {
    if (processedEvent) {
      k30066.update((currentk30066) => {
        return [processedEvent, ...currentk30066]
          .filter(
            (v, i, a) => a.findIndex((t) => t.dTag === v.dTag) === i,
          )
          .filter( ev => ev.created_at > Math.round(Date.now()/1000)-ONLINE_THRESHOLD )
      });
    }
  };

  const queueEvent = (event) => {
    newEvents.push(event);
  };

  const populateNextEvent = () => {
    if(!newEvents.length) return
    const event = newEvents.shift()
    updateEvents(event);
    processBatch();
    if (!isMuted) toneGenerator.playNextNote();
  };

  const on_event_handler = (event) => {
    if (initialSyncComplete && event.created_at < since) return;
    const processedEvent = processEvent(event);
    // if(processedEvent.tags.filter(tag => tag[0] === 'rtt').length === 0) {
    //   console.log(processedEvent.dTag, processedEvent.tags)
    //   return
    // }
    since = event.created_at;
    if (!initialSyncComplete) 
      updateEvents(processedEvent);
    else 
      queueEvent(processedEvent);
  };

  async function initialSync() {
    const fetcher = NostrFetcher.init();
    const iter = fetcher.allEventsIterator(
      relays,
      {
        kinds: [30066],
        authors: [MONITOR],
      },
      { since },
      { skipVerification: true },
    );
    for await (const ev of iter) {
      on_event_handler(ev);
    }
    // initialSyncComplete=true
    // processBatch()
    // return Promise.resolve
  }

  const continuousSync = async () => {
    let h = RelayPool.subscribeMany(
    [...relays],
    [
      {
        limit: 10000,
        kinds: [30066],
        authors: [MONITOR],
        since,
      }
    ],
    {
      onevent(event) {
        on_event_handler(event);
      },
      onclose() {
        const reconnect = 2000;
        console.log(`Subscription closed, reconnecting in ${reconnect}`);
        setTimeout(continuousSync, reconnect);
      },
      oneose() {
        console.log("EOSE");
        processBatch();
        initialSyncComplete = true;
      },
    },
  )
    // RelaySocket = await Relay.connect("wss://relaypag.es").catch(
    //   continuousSync,
    // );
    // RelaySocket.subscribe(
    //   [
    //     {
    //       limit: 1000,
    //       kinds: [30066],
    //       authors: [MONITOR],
    //       since,
    //     },
    //   ],
    //   {
    //     onevent(event) {
    //       on_event_handler(event);
    //     },
    //     onclose() {
    //       const reconnect = 2000;
    //       console.log(`Subscription closed, reconnecting in ${reconnect}`);
    //       setTimeout(continuousSync, reconnect);
    //     },
    //     oneose() {
    //       console.log("EOSE");
    //       processBatch();
    //       initialSyncComplete = true;
    //     },
    //   },
    // );
  };

  async function get30166(relay) {
    console.log(`getting 30166 for ${relay.url}`);
    return new Promise(async (resolve) => {
      RelaySocket = await Relay.connect("wss://relaypag.es").catch(
        console.error,
      );
      RelaySocket.subscribe(
        [
          {
            "#d": [relay],
            limit: 1,
            kinds: [30166],
            authors: [MONITOR],
            since: Math.round(Date.now() / 1000) - 60 * 60 * 2,
          },
        ],
        {
          onevent(event) {
            resolve(event);
          },
        },
      );
    });
  }

  k30066.subscribe(async ($k30066) => {
    await tick(); // Wait for DOM updates

    if (initialSyncComplete && !masonry) {
      initializeMasonry();
    } else if (masonry) {
      masonry.reloadItems();
      masonry.layout();
    }
  });

  function initializeMasonry() {
    masonry = new Masonry("#k30066", {
      itemSelector: ".event",
      percentPosition: true,
      horizontalOrder: true,
    });
  }

  function removeExtraFieldsFromEvent(event) {
    const ev = {};
    const keys = [
      "sig",
      "pubkey",
      "id",
      "created_at",
      "content",
      "tags",
      "kind",
    ];
    for (const key in event) {
      if (keys.includes(key)) ev[key] = event[key];
    }
    return ev;
  }

  function getUrlFromEvent(event) {
    return event.tags.filter((tag) => tag[0] == "d")?.[0]?.[1];
  }

  function parse30066(event) {
    const parsedTags = {};
    const url = getUrlFromEvent(event);
    if (!url) return { error: "no d tag?" };
    const tags = event.tags.filter((tag) => tag.length >= 3);
    tags.forEach((tag) => {
      const [key, subkey, ...values] = tag;
      if (!parsedTags[key]) {
        parsedTags[key] = {};
      }
      if (!parsedTags[key][subkey]) {
        parsedTags[key][subkey] =
          values.length > 1
            ? values.map((v) => castValue(v))
            : castValue(values[0]);
      } else {
        if (Array.isArray(parsedTags[key][subkey])) {
          parsedTags[key][subkey] = [
            ...parsedTags[key][subkey],
            ...values.map((v) => castValue(v)),
          ];
        } else {
          parsedTags[key][subkey] = [
            parsedTags[key][subkey],
            ...values.map((v) => castValue(v)),
          ];
        }
      }
    });
    if (!parsedTags?.rtt?.open)
      return { error: "no rtt connect tag?", tags: tags };
    return { url, ...parsedTags };
  }

  function castValue(value) {
    // Check for boolean strings
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;

    // Check for IPv4 addresses or similar patterns that should not be converted
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (ipv4Regex.test(value)) return value;

    // Additional check for geohash-like patterns (alphanumeric strings)
    // This regex matches strings that contain both letters and numbers, indicative of a geohash
    const geohashRegex = /^[0-9a-zA-Z]+$/;
    if (
      geohashRegex.test(value) &&
      /[a-zA-Z]/.test(value) &&
      /[0-9]/.test(value)
    )
      return value;

    // Attempt to parse as a float
    const asFloat = parseFloat(value);
    if (!isNaN(asFloat) && isFinite(asFloat) && String(asFloat) === value) {
      return asFloat;
    }

    // Return the original value if none of the above conditions are met
    return value;
  }

  onMount(async () => {
    await initialSync();
    eventRunner = setInterval( populateNextEvent, 250 )
    await continuousSync();
    return () => {
      clearInterval(eventRunner)
      RelaySocket.close();
    };
  });

  function processBatch() {
    if (!initialSyncComplete) initialSyncComplete = true;
    k30066.update((currentk30066) => [...currentk30066]);
  }

  function calculateDimensions(event) {
    // Default dimension and RTT scaling factor
    const defaultDimension = 150; // Base size of the block
    const rttScalingFactor = 0.02; // Determines how much RTT affects the size

    // Max RTT value for scaling
    const maxRTT = 10000; // Example max value, adjust based on expected RTT range

    // Check if the event has RTT data
    if (event.tags && Array.isArray(event.tags)) {
      const rttValues = event.tags
        .filter((tag) => tag[0] === "rtt")
        .map((tag) => parseInt(tag[2], 10));
      const totalRTT = rttValues.reduce((acc, rtt) => acc + rtt, 0);

      // Calculate the scaled dimension inversely related to RTT
      // Ensure that the totalRTT does not exceed maxRTT for calculation purposes
      const effectiveRTT = Math.min(totalRTT, maxRTT);

      // Adjust the dimension based on RTT, making higher RTT result in smaller dimensions
      return (
        defaultDimension -
        Math.min(effectiveRTT * rttScalingFactor, defaultDimension - 1)
      );
    } else {
      return defaultDimension;
    }
  }

  // function calculateDimensions(event) {
  //   // Default dimension and RTT scaling factor
  //   const defaultDimension = 50; // Base size of the block
  //   const rttScalingFactor = 0.05; // Determines how much RTT affects the size

  //   // Check if the event has RTT data
  //   if (event.tags && Array.isArray(event.tags)) {
  //     const rttValues = event.tags.filter(tag => tag[0] === 'rtt').map(tag => parseInt(tag[2], 10));
  //     const totalRTT = rttValues.reduce((acc, rtt) => acc + rtt, 0);
  //     return defaultDimension + (totalRTT * rttScalingFactor);
  //   } else {
  //     return defaultDimension;
  //   }
  // }

  function generateSaturatedColorFromTag(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32bit integer
    }

    let color = "#";
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 255;
      color += ("00" + value.toString(16)).substr(-2);
    }
    return color;
  }

  function getRttFromEvent(key, event) {
    const rtt = event.tags.filter(
      (tag) => tag[0] === "rtt" && tag[1] === key,
    )?.[0]?.[2];
    return rtt ? rtt : "";
  }

  function rttDisplay(key, event) {
    const rtt = getRttFromEvent(key, event);
    const letter = key ? key.charAt(0).toUpperCase() : "";
    return rtt ? `${letter}:${rtt}ms` : "";
  }

  let isMuted = true; // Initial state of the sound, assuming it starts muted

  // Function to toggle the muted state
  async function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) return;
    if (Tone.context.state !== "running") await Tone.start();
    else Tone.Transport.cancel();
    if (!toneGenerator) toneGenerator = new ToneGenerator();
  }

  window.addEventListener("resize", () => {
    if (masonry) {
      masonry.layout();
    }
  });
</script>

{#if initialSyncComplete}
  <button
    on:click={() => {
      toggleMute();
    }}
    class="mute"
  >
    {isMuted ? "🔇" : "🔈"}
  </button>
  <div id="header">
    <span class="sitetitle">nostrpul.se</span>
    <span class="credit">by nostr.watch</span>
    <!-- <a class="info" 
      href="#"
      on:click={() => { showGenericModal("info");} }
      role="button" 
      tabindex="0" 
      on:keydown={(event) => event.key === 'Enter' && showGenericModal(ev.id)}>
        ⓘ
    </a>  -->
    <span class="byline"><em><strong>nostr is the api</strong></em></span>
  </div>
  <div id="stats">
    <div id="online" class="metric">
      <span class="value">{$k30066.length}</span>
      <span class="key">online</span>
    </div>
    <div id="readable" class="metric">
      <span class="value"
        >{$k30066.filter(
          (event) =>
            event.tags.filter((tag) => tag[0] === "rtt" && tag[1] === "read")
              .length > 0,
        ).length}</span
      >
      <span class="key">readable</span>
    </div>
    <div id="writable" class="metric">
      <span class="value"
        >{$k30066.filter(
          (event) =>
            event.tags.filter((tag) => tag[0] === "rtt" && tag[1] === "write")
              .length > 0,
        ).length}</span
      >
      <span class="key">writable</span>
    </div>
  </div>
  <main class="main section">
    <div id="k30066">
      {#each $k30066 as ev (ev.id)}
        <div
          class="event"
          style={`height: ${ev.dimension}px; background-color: ${ev.backgroundColor};`}
          in:fade
          on:click={() => showRelayModal(ev)}
          role="button"
          tabindex="0"
          on:keydown={(event) => {
            event.key === "Enter" && showRelayModal(ev);
          }}
        >
          <span class="rtt">{rttDisplay("open", ev)}</span>
          <span class="rtt">{rttDisplay("read", ev)}</span>
          <span class="rtt">{rttDisplay("write", ev)}</span>
        </div>
        {#if currentRelayModal === ev.id}
          <Modal showModal={true} on:close={hideModals} {ev}>
            <span slot="header">{getUrlFromEvent(ev)}</span>
            <div class="tabs">
              <button
                on:click={() => ($activeTab = 0)}
                style="background-color: {ev.backgroundColor}"
                class={$activeTab === 0 ? "active" : ""}
              >
                PARSED 30066
              </button>
              <button
                on:click={() => ($activeTab = 1)}
                style="background-color: {ev.backgroundColor}"
                class={$activeTab === 1 ? "active" : ""}
              >
                RAW 30066
              </button>
              <button
                on:click={() => {
                  $activeTab = 2;
                }}
                style="background-color: {ev.backgroundColor}"
                class={$activeTab === 2 ? "active" : ""}
              >
                RAW 30166
              </button>
            </div>
            <div class="tab-contents">
              {#if $activeTab === 0 && currentRelayModal === ev.id}
                <div class="tab-content">
                  <pre>{JSON.stringify(parse30066(ev), null, 4)}</pre>
                </div>
              {/if}
              {#if $activeTab === 1 && currentRelayModal === ev.id}
                <div class="tab-content">
                  <pre>{JSON.stringify(
                      removeExtraFieldsFromEvent(ev),
                      null,
                      4,
                    )}</pre>
                </div>
              {/if}
              {#if $activeTab === 2 && currentRelayModal === ev.id}
                <div class="tab-content">
                  {#if $loading30166}
                    <p>Loading 30166 event...</p>
                  {:else if $event30166}
                    <!-- Render your eventData here -->
                    <pre>{JSON.stringify($event30166, null, 4)}</pre>
                  {:else}
                    <p>Non 30166 event for this relay. (try again?)</p>
                  {/if}
                </div>
              {/if}
              <p></p>
              <pre></pre>
            </div>

            <!-- <pre>{JSON.stringify(ev, null, 4)}</pre> -->
          </Modal>
        {/if}
      {/each}
    </div>
  </main>

  {#if currentGenericModal === "info"}
    <Modal showModal={true} on:close={hideModals}>
      <div class="pontification">
        <p>
          nostrpul.se is a demonstration of <a
            href="https://github.com/nostr-protocol/nips/pull/230"
            target="_new">NIP-66</a
          >
          events, built to increase awareness of
          <strong>protocol-level relay meta-data and discoverability.</strong>
        </p>
        <p>
          With the advent of nostr, proprietary, centralized APIs are a relic of
          a bygone era, only clinged onto by those who wish to control the
          future. In late-2022 it was obvious to me that relay data should be protocol level,
          as the proprietary control over this data could lead to
          centralization and censorship. 
        </p>
        <p>
          By liberating network data for free and making it
          accessible over nostr, there can be an open marketplace for data
          we can cross-reference. This can help to identify dark patterns, instead of
          allowing those dark patterns to go unnoticed, whgen served over proprietary
          APIs.
        </p>
        <p>
          I've spent the better part of a year analyzing, understanding and
          reporting on nostr relays. Contrary to the belief of some cats, relays <strong>
          are not just generalized data-warehouses.</strong> Just like your favorite 
          nostr client, for better or worse, relays can be whatever the fuck you want them to be
        </p>
      </div>
    </Modal>
  {/if}
{:else}
  <div id="loading">loading</div>
{/if}

<style>
  body,
  html,
  :root {
    background-color: white;
    margin: 0;
    padding: 0;
    color-scheme: light;
  }

  button {
    margin: 0;
    border: 0;
    width: 32%;
    cursor: pointer;
    padding: 5px 0;
    font-weight: bold;
    font-size: 0.8em;
    border-right: #000;
    opacity: 0.6;
  }

  button:hover {
    opacity: 0.8;
  }

  button.active {
    opacity: 1;
  }

  #header {
    position: absolute;
    top: 0px;
    left: 0px;
    right: 0px;
    font-size: clamp(3rem, 2vw, 10em);
    z-index: 10;
    padding: 10px 50px;
    z-index: 0;
  }

  #header .sitetitle {
    color: rgba(0, 0, 0, 0.3);
  }

  #header .credit {
    color: rgba(0, 0, 0, 0.2);
    font-size: clamp(2rem, 1vw, 2em);
  }

  #header .byline {
    color: rgba(0, 0, 0, 0.1);
    float: right;
  }

  #header .info {
    color: rgba(0, 0, 0, 0.3);
    cursor: pointer;
    display: inline-block;
    font-weight: bolder;
  }

  .main.section {
    position: fixed !important;
    top: 0px;
    left: 0px;
    right: 0px;
    bottom: 0px;
    overflow: hidden;
    z-index: 1;
  }

  .event {
    width: 2.5%;
    margin: 0;
    padding: 0;
    break-inside: avoid;
    opacity: 0.5;
    transition: opacity 10s ease;
  }

  .event:hover {
    opacity: 1;
    transition: opacity 0.3s ease-out;
  }

  .event > .rtt {
    display: none;
  }

  .event:hover > .rtt {
    display: block;
    color: black;
    cursor: pointer;
    font-family: monospace;
  }

  #loading {
    font-size: clamp(5rem, 10vw, 50em); /* Responsive font size */
    color: rgba(0, 0, 0, 0.05);
  }

  #stats {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(0, 0, 0, 0.5);
    transform: translateY(-50%);
  }

  #stats .metric {
    width: 33%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }

  #stats .metric > * {
    display: block;
  }

  #stats .metric .key {
    font-size: clamp(2rem, 5vw, 5em); /* Responsive font size */
  }

  #stats .metric .value {
    font-size: clamp(6rem, 12vw, 25em); /* Responsive font size */
  }

  .mute {
    display: inline;
    background: none;
    border: none;
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    font-size: 3em;
  }

  .test {
    display: inline;
    background: none;
    border: none;
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    font-size: 3em;
  }

  @media (max-width: 600px) {
    #stats {
      flex-direction: column;
    }

    #stats .metric {
      width: 100%;
      margin-bottom: 20px;
    }

    #header {
      position: relative;
      top: 0px;
      left: 0px;
      right: 0px;
      font-size: clamp(2rem, 2vw, 2em);
      z-index: 10;
      padding: 10px 50px;
      z-index: 0;
    }

    #header .sitetitle {
      position: fixed;
      top: 0px;
      transform: translateX(-50%);
      left: 50%;
      color: rgba(0, 0, 0, 0.3);
    }

    #header .credit {
      position: fixed;
      top: 40px;
      transform: translateX(-50%);
      left: 50%;
      color: rgba(0, 0, 0, 0.2);
      font-size: clamp(1rem, 1vw, 2em);
    }

    #header .byline {
      color: rgba(0, 0, 0, 0.1);
      float: none;
      position: fixed;
      bottom: 0px;
      left: 0px;
      right: 0px;
      display: block;
      width: 100%;
      text-align: center;
    }

    #header .info {
      color: rgba(0, 0, 0, 0.3);
      cursor: pointer;
      display: inline-block;
      font-weight: bolder;
    }

    .mute {
      display: none;
    }
  }
</style>
