<script>
  document.title = "nostrpul.se";

  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { writable } from "svelte/store";

  import Loading from "./components/Loading.svelte";

  import Modal from "./Modal.svelte";

  import * as Tone from "tone";
  import ToneGenerator from "./tone";

  import { NostrFetcher } from "nostr-fetch";
  import { Relay, SimplePool } from "nostr-tools";

  import Masonry from "masonry-layout";

  let toneGenerator;

  import { generateBackground } from "./utils";

  // draft7 prod
  const DEFAULT_MONITOR = [
    "9bbbb845e5b6c831c29789900769843ab43bb5047abe697870cb50b6fc9bf923",
    "9b85d54cc4bc886d60782f80d676e41bc637ed3ecc73d2bb5aabadc499d6a340",
    "9bb7cd94d7b688a4070205d9fb5e9cca6bd781fe7cabe780e19fdd23a036e0a1",
    "9ba6484003e8e88600f97ebffd897b2fe82753082e8e0cd8ea19aac0ff2b712b",
    "9ba1d7892cd057f5aca5d629a5a601f64bc3e0f1fc6ed9c939845e25d5e1e254",
    "9bac3d58ef5a34c7c4a9b05b07c98e4afc56655542387b4d36c9d270f898592e",
    "9ba0ce3dcc28c26da0d0d87fa460c78b602a180b61eb70b62aba04505c6331f4",
    "9ba046db56b8e6682c48af8d6425ffe80430a3cd0854d95381af27c5d27ca0f7"
  ];

  const authors = DEFAULT_MONITOR

  const ONLINE_THRESHOLD = Math.round(Date.now() / 1000) - (60 * 60 * 6);

  let currentRelayModal = null;
  let currentGenericModal = null;

  let RelaySocket;
  let RelayPool = new SimplePool();
  const relays = ["wss://relay.nostr.watch", "wss://relaypag.es", "wss://history.nostr.watch"];

  let monitorChanged = false
  const activeMonitor = writable(DEFAULT_MONITOR)
  const doNotReconnect = writable(false)
  const activeSubscription = writable({})
  const monitorThreshold = writable(ONLINE_THRESHOLD)
  const monitors = writable([])
  // const monitors = writable(new Map())
  const k30166 = writable([]);
  const loading30166 = writable(false);
  let activeTab = writable(0);
  let focusRelay = writable(null);

  let loading = true;
  let masonry;
  let initialSyncComplete = false;
  let since = $monitorThreshold

  const newEvents = [];
  
  let eventRunner
    
  import WsWorker from "./worker?worker";
    import { warn } from "tone/build/esm/core/util/Debug";

  const worker = new WsWorker();

  function hideModals() {
    activeTab.set(0);
    focusRelay.set(null);
    hideRelayModal();
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
      k30166.update((currentk30166) => {
        const events = [processedEvent, ...currentk30166]
          .filter(
            (v, i, a) => a.findIndex((t) => t.dTag === v.dTag) === i,
          )
          .filter( ev => ev.created_at > Math.round(Date.now()/1000)-ONLINE_THRESHOLD )
        return events
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
    if (!isMuted) toneGenerator.playNextNote();
    // processBatch();
    
  };

  const existsAndHasBeenReported = (event) => {
    const existing = $k30166.find((ev) => getUrlFromEvent(ev) === getUrlFromEvent(event));
    if(!existing || !existing?.length) return false
    if(existing.created_at > Date.now()/1000-ONLINE_THRESHOLD) return true
    return false
  };

  const on_event_handler = (event) => {
    if(existsAndHasBeenReported(event)) return
    // if (initialSyncComplete && event.created_at < since) return;
    const processedEvent = processEvent(event);
    since = event.created_at;
    if (!initialSyncComplete) 
      updateEvents(processedEvent);
    else 
      queueEvent(processedEvent);
  };

  async function bindWorker(){
    worker.addEventListener('message', (message) => {
      const { type } = message.data

      if(type === 'monitor'){
        const { monitor } = message.data
        
      }
      if(type === 'event'){
        const { event } = message.data
        on_event_handler(event)
      }
      if(type === 'events'){
        const { events, monitors:_monitors } = message.data
        let slow = false 
        let lastEvent = 0 
        let timeout
        monitors.set(_monitors)
        for(const event of events) {
          clearTimeout(timeout)
          on_event_handler(event)
          lastEvent = Date.now()
          timeout = setTimeout( () => { 
            initialSyncComplete = true;
            processBatch()
          }, 2000)
        }
      }
      if(type === 'events_excess'){
        const { events } = message.data
        
        for(const event of events) {
          // console.log(event.tags.find(t => t[0] === 'd')[1])
          on_event_handler(event)
        }
      }
      if(type == 'eose'){
        initialSyncComplete = true;
        processBatch()
        continuousSync()
      }
    })
  }

  async function syncMonitorEvents(){
    worker.postMessage({ type: "seed", authors, relays, since })
  }

  const continuousSync = async () => {
    worker.postMessage({ type: "sync", authors, relays, since })
  };

  k30166.subscribe(async ($k30166) => {
    await tick();
    if (initialSyncComplete && !masonry) {
      initializeMasonry();
    } else if (masonry) {
      masonry.reloadItems();
      masonry.layout();
    }
  });

  function initializeMasonry() {
    masonry = new Masonry("#k30166", {
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
    return event.tags.find((tag) => tag[0] == "d")?.[1];
  }

  onDestroy(() => {
    worker.terminate()
  });

  onMount(async () => {
    bindWorker()
    syncMonitorEvents()
    eventRunner = setInterval( populateNextEvent, 250 )
    return () => {
      clearInterval(eventRunner)
      RelaySocket.close();
    };
  });

  function processBatch() {
    k30166.update((currentk30166) => [...currentk30166]);
  }

  function calculateDimensions(event) {
    const defaultDimension = 150; // Base size of the block
    const rttScalingFactor = 0.02; // Determines how much RTT affects the size

    // Max RTT value for scaling
    const maxRTT = 10000; // Example max value, adjust based on expected RTT range

    // Check if the event has RTT data
    if (event.tags && Array.isArray(event.tags)) {
      const rttValues = event.tags
        .filter((tag) => tag[0].includes('rtt'))
        .map((tag) => parseInt(tag[1], 10));
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
    const rtt = event.tags.find(
      (tag) => tag[0].includes("rtt") && tag[0].includes(key),
    )?.[1];
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

  // $: getMonitors = Array.from($monitors.keys())
  // $: getMonitor = (pubkey) => $monitors.get(pubkey)
  // $: getMonitorName = (pubkey) => JSON.parse(getMonitor(pubkey)?.['0']?.content)?.name
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
    <span class="byline"><em><strong>NIP-66 draft 7</strong></em></span>
  </div>
  <div id="stats">
    <div id="online" class="metric">
      <span class="value">{$k30166.length}</span>
      <span class="key">relays online</span>
    </div>
    <!-- <div id="readable" class="metric">
      <span class="value"
        >{$k30166.filter(
          (event) =>
            event.tags.filter((tag) => tag[0] === "rtt" && tag[1] === "read")
              .length > 0,
        ).length}</span
      >
      <span class="key">readable</span>
    </div>
    <div id="writable" class="metric">
      <span class="value"
        >{$k30166.filter(
          (event) =>
            event.tags.filter((tag) => tag[0] === "rtt" && tag[1] === "write")
              .length > 0,
        ).length}</span
      >
      <span class="key">writable</span>
    </div> -->
  </div>
  <main class="main section">
    <div id="k30166">
      {#each $k30166 as ev (ev.id)}
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
            <pre>
              {JSON.stringify(
                removeExtraFieldsFromEvent(ev),
                null,
                4,
              )}
            </pre>
            <!-- <pre>{JSON.stringify(ev, null, 4)}</pre> -->
          </Modal>
        {/if}
      {/each}
    </div>
  </main>

  <!-- <div id="selector" style="z-index: 9999">
    <select bind:value={$activeMonitor} on:change={() => changeMonitor()}>
      {#each getMonitors as pubkey}
        <option value={pubkey}>{getMonitorName(pubkey)}</option>
      {/each}
      <option value="all">all</option>
    </select>
  </div> -->
{:else}
  <div id="loadingText">found {$k30166.length} relays from {$monitors.length} monitors</div>
  <Loading />
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

  #selector {
    z-index: 300;
    position: relative;
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
    color: rgba(0, 0, 0, 0.3);
    float: right;
    font-size: clamp(1.5rem, 1.5vw, 4em);
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


  #loadingText {
      color:#000;
      font-size: 3em;
      position: fixed;
      display:block;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
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
