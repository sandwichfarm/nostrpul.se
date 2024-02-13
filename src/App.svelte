<script>
  document.title = "nostrpul.se";
  
  import { onMount, afterUpdate, tick } from 'svelte';
  import Modal from './Modal.svelte';
  // import Tabs from './components/tabs/Tabs.svelte';
  import { Relay } from 'nostr-tools';
  import { fade } from 'svelte/transition';
  import Masonry from 'masonry-layout';  
  import { writable } from 'svelte/store';

  import {generateBackground} from './utils'

  const MONITOR = 'cd18a5109bd5a3110e173331d873725dbf0c5bedc9357a3cc80ed7029b24e974'

  let currentRelayModal = null;
  let currentGenericModal = null;

  let RelaySocket

  const k30066 = writable([]);
  const k30166 = writable([]);
  const loading30166 = writable(false)
  const event30166 = writable(null)
  let activeTab = writable(0); // Currently selected tab index


  let loading = true;
  let masonry;
  let firstEoseReceived = false;
  let since = Math.round(Date.now() / 1000) - (60 * 60 * 1.1)

  $: if ($activeTab) {
    const ev = get30166($activeTab)
      .then(ev => {
        event30166.set(ev);
        loading30166.set(false);
      })
      .catch(console.error)
  }

  // let currentRelayModal = null; 

  function hideModals(){
    hideGenericModal()
    hideRelayModal()
  }

  function showGenericModal(id) {
    currentGenericModal = id;
  }

  function hideGenericModal() {
    currentGenericModal = null;
  }

  function showRelayModal(id) {
    currentRelayModal = id;
  }

  function hideRelayModal() {
    currentRelayModal = null;
  }

  function processEvent(event) {
    const dTag = event.tags.find(tag => tag[0] === 'd');
    if (!dTag) return null; 

    return {
      ...event,
      dimension: calculateDimensions(event),
      backgroundColor: generateBackground(event),
      dTag: dTag[1]
    };
  }

  async function get30166(relay){
    return new Promise( async (resolve) => {
      RelaySocket = await Relay.connect('wss://history.nostr.watch').catch(connect);
      RelaySocket.subscribe(
        [
          {
            limit: 1,
            kinds: [30166],
            authors: [MONITOR],
            since: Math.round(Date.now()/1000)-(60*60*2)
          }
        ],
        {
          onevent(event) {  
            resolve(event)
          },
        }
      );
    })
  }

  k30066.subscribe(async ($k30066) => {
    await tick(); // Wait for DOM updates

    if (firstEoseReceived && !masonry) {
      initializeMasonry();
    } else if (masonry) {
        masonry.reloadItems();
      masonry.layout();
    }
  });

  function initializeMasonry() {
    masonry = new Masonry('#k30066', {
      itemSelector: '.event',
      percentPosition: true,
      horizontalOrder: true
    });
  }

  function removeExtraFieldsFromEvent(event){
    const ev = {}
    const keys = ['sig', 'pubkey', 'id', 'created_at', 'content', 'tags', 'kind']
    for(const key in event){
      console.log(key)
      if(keys.includes(key)) ev[key] = event[key]
    }
    return ev
  }

  function parse30066(event) {
    const parsedTags = {};
    const url = event.tags.filter( tag => tag[0] == 'd')?.[0]?.[1]
    if(!url) return { error: "no d tag?" }
    const tags = event.tags.filter( tag => tag.length >= 3)
    tags.forEach(tag => {
        const [key, subkey, ...values] = tag;
        if (!parsedTags[key]) {
            parsedTags[key] = {};
        }
        if (!parsedTags[key][subkey]) {
            parsedTags[key][subkey] = values.length > 1 ? values.map(v => castValue(v)) : castValue(values[0]);
        }
        else {
            if (Array.isArray(parsedTags[key][subkey])) {
                parsedTags[key][subkey] = [...parsedTags[key][subkey], ...values.map(v => castValue(v))];
            }
            else {
                parsedTags[key][subkey] = [parsedTags[key][subkey], ...values.map(v => castValue(v))];
            }
        }
    });
    if(!parsedTags?.rtt?.open) return { error: "no rtt connect tag?", tags: tags }
    return { url, ...parsedTags};
  }

  function castValue(value) {
      // Check for boolean strings
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      
      // Check for IPv4 addresses or similar patterns that should not be converted
      const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      if (ipv4Regex.test(value)) return value;

      // Additional check for geohash-like patterns (alphanumeric strings)
      // This regex matches strings that contain both letters and numbers, indicative of a geohash
      const geohashRegex = /^[0-9a-zA-Z]+$/;
      if (geohashRegex.test(value) && /[a-zA-Z]/.test(value) && /[0-9]/.test(value)) return value;

      // Attempt to parse as a float
      const asFloat = parseFloat(value);
      if (!isNaN(asFloat) && isFinite(asFloat) && String(asFloat) === value) {
          return asFloat;
      }

      // Return the original value if none of the above conditions are met
      return value;
  }

  const connect = async () => {
    RelaySocket = await Relay.connect('wss://history.nostr.watch').catch(connect);
    RelaySocket.subscribe(
      [
        {
          limit: 1000,
          kinds: [30066],
          authors: [MONITOR],
          since
        }
      ],
      {
        onevent(event) {  
          if(firstEoseReceived && event.created_at < since) return
          const processedEvent = processEvent(event);
          since = event.created_at
          if (processedEvent) {
            k30066.update(currentk30066 => {
              return [processedEvent, ...currentk30066].filter((v, i, a) => a.findIndex(t => (t.dTag === v.dTag)) === i);
            });
          }
          if(!firstEoseReceived) return 
          processBatch()
          console.log(event.id)
        },
        onclose() {
          const reconnect = 2000
          console.log(`Subscription closed, reconnecting in ${reconnect}`);
          setTimeout( connect, reconnect )
        },
        oneose() {
          console.log('EOSE')
          processBatch();
          firstEoseReceived=true
        }
      }
    );
  }

  onMount(async () => {
    await connect()

    return () => {
      RelaySocket.close();
    };
  });

   function processBatch() {
    if (!firstEoseReceived) firstEoseReceived = true;  
    k30066.update(currentk30066 => [...currentk30066]);
  }

  function calculateDimensions(event) {
    // Default dimension and RTT scaling factor
    const defaultDimension = 150; // Base size of the block
    const rttScalingFactor = 0.05; // Determines how much RTT affects the size

    // Max RTT value for scaling
    const maxRTT = 10000; // Example max value, adjust based on expected RTT range

    // Check if the event has RTT data
    if (event.tags && Array.isArray(event.tags)) {
        const rttValues = event.tags.filter(tag => tag[0] === 'rtt').map(tag => parseInt(tag[2], 10));
        const totalRTT = rttValues.reduce((acc, rtt) => acc + rtt, 0);
        
        // Calculate the scaled dimension inversely related to RTT
        // Ensure that the totalRTT does not exceed maxRTT for calculation purposes
        const effectiveRTT = Math.min(totalRTT, maxRTT);
        
        // Adjust the dimension based on RTT, making higher RTT result in smaller dimensions
        return defaultDimension - Math.min(effectiveRTT * rttScalingFactor, defaultDimension - 1);
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
      hash = ((hash << 5) - hash) + char;
      hash &= hash; // Convert to 32bit integer
    }

    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 255;
      color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
  }

  function getRttFromEvent(key, event){
    const rtt = event.tags.filter(tag => tag[0] === 'rtt' && tag[1] === key)?.[0]?.[2]
    return rtt? rtt: ''
  }

  function rttDisplay(key, event){
    const rtt = getRttFromEvent(key, event)
    const letter = key ? key.charAt(0).toUpperCase() : '';
    return rtt? `${letter}:${rtt}ms`: ''
  }


  window.addEventListener('resize', () => {
    if (masonry) {
      masonry.layout();
    }
  });
</script>

{#if firstEoseReceived}
  <div id="header">
    <span class="sitetitle">nostrpul.se</span> 
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
      <span class="value">{$k30066.filter(event => event.tags.filter( tag => tag[0] === 'rtt' && tag[1] === 'read').length > 0 ).length}</span>
      <span class="key">readable</span>
    </div>
    <div id="writable" class="metric">
      <span class="value">{$k30066.filter(event => event.tags.filter( tag => tag[0] === 'rtt' && tag[1] === 'write').length > 0 ).length}</span>
      <span class="key">writable</span>
    </div>
  </div>
  <main class="main section">
    <div id="k30066">
      {#each $k30066 as ev, index (ev.id)}
        <div class="event" 
            style={`height: ${ev.dimension}px; background-color: ${ev.backgroundColor};`} 
            in:fade 
            on:click={() => showRelayModal(ev.id)} 
            role="button" 
            tabindex="0" 
            on:keydown={(event) => event.key === 'Enter' && showRelayModal(ev.id)}>
          <span class="rtt">{rttDisplay('open', ev)}</span>
          <span class="rtt">{rttDisplay('read', ev)}</span>
          <span class="rtt">{rttDisplay('write', ev)}</span>
        </div>
        {#if currentRelayModal === ev.id}
          <Modal showModal={true} on:close={hideModals} ev={ev}>
            <span slot="header" >{parse30066(ev)?.url}</span>
            <div class="tabs">
              <button on:click={() => $activeTab = 0} style="background-color: {ev.backgroundColor}" class="{$activeTab === 0 ? 'active' : ''}">
                PARSED 30066
              </button>
              <button on:click={() => $activeTab = 1} style="background-color: {ev.backgroundColor}" class="{$activeTab === 1 ? 'active' : ''}">
                RAW 30066
              </button>
              <button on:click={() => { $activeTab = 2 } } style="background-color: {ev.backgroundColor}" class="{$activeTab === 2 ? 'active' : ''}">
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
                <pre>{JSON.stringify(removeExtraFieldsFromEvent(ev), null, 4)}</pre>
              </div>
              {/if}
              {#if $activeTab === 2 && currentRelayModal === ev.id}
              <div class="tab-content">
                {#if $loading30166}
                  <p>Loading 30166 event...</p>
                {:else}
                  {#if $event30166}
                    <!-- Render your eventData here -->
                    <pre>{JSON.stringify($event30166, null, 4)}</pre>
                  {:else}
                    <p>Non 30166 event for this relay. (try again?)</p>
                  {/if}
                {/if}
              </div>
              {/if}
              <p>
                
              </p>
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
      nostrpul.se is a demonstration of <a href="https://github.com/nostr-protocol/nips/pull/230" target="_new">NIP-66</a> events, 
      built to increase awareness of <strong>protocol-level relay meta-data and discoverability.</strong> 
      </p>
      <p>
      With the advent of nostr, proprietary, centralized APIs are a relic of a bygone era, only clinged onto by those who wish to control the future. 
      It was obvious to me that relay data should be protocol level, as the proprietary, centralized control over this data could lead to centralization 
      and censorship. By having the network data free and accessible over nostr, that can be provided by any number of monitors, we can cross-reference data to identify 
      dark patterns, instead of allowing those dark patterns to go unnoticed, served over proprietary APIs. 
      </p>
      <p>
      I've spent the better part of a year analyzing, understanding and reporting on nostr relays. Contrary to the belief of some cats, 
      relays <strong>are not just generalized data-warehouses.</strong> Just like your favorite nostr client, for better or worse, relays can be whatever 
      the fuck you want them to be
      </p>
      </div>
    </Modal>
  {/if}
{:else}
  <div id="loading">loading</div>
{/if}

<style>

body, html, :root { 
  background-color:white; 
  margin:0;
  padding:0;
  color-scheme: light;
}

button {
  margin:0;
  border:0;
  width:32%;
  cursor:pointer;
  padding:5px 0;
  font-weight:bold;
  font-size:0.8em;
  border-right:#000;
  opacity:0.6;
}

button:hover {
  opacity:0.8;
}

button.active{
  opacity:1;
}

#header {
  position:absolute;
  top:0px;
  left:0px;
  right:0px;
  font-size: clamp(3rem, 2vw, 10em);
  z-index:10;
  padding:10px 50px;
  z-index:0;
}

#header .sitetitle {
  color:rgba(0,0,0,0.3);
}

#header .byline {
  color:rgba(0,0,0,0.1);
  float:right;
}

#header .info {
  color:rgba(0,0,0,0.3);
  cursor:pointer;
  display:inline-block;
  font-weight:bolder
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
  display:none;
}

.event:hover > .rtt {
  display:block;
  color:black;
  cursor:pointer;
  font-family: monospace;
}

#loading { 
  font-size: clamp(5rem, 10vw, 50em); /* Responsive font size */
  color:rgba(0,0,0,0.05);
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
  display:block;
}

#stats .metric .key {
  font-size: clamp(2rem, 5vw, 5em); /* Responsive font size */
}

#stats .metric .value {
  font-size: clamp(6rem, 12vw, 25em); /* Responsive font size */
}

@media (max-width: 600px) {
  #stats {
    flex-direction: column;
  }

  #stats .metric {
    width: 100%;
    margin-bottom: 20px;
  }
}
</style>