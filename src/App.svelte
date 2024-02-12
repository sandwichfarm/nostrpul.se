<script>
  
  
  import { onMount, afterUpdate, tick } from 'svelte';
  import Modal from './Modal.svelte';
  import { Relay } from 'nostr-tools';
  import { fade } from 'svelte/transition';
  import Masonry from 'masonry-layout';  
  import { writable } from 'svelte/store';

  let currentModal = null;

  const events = writable([]);
  let loading = true;
  let masonry;
  let firstEoseReceived = false;
  let since = Math.round(Date.now() / 1000) - (60 * 60 * 1.1)

  // let currentModal = null; 

  function showModal(id) {
    currentModal = id;
  }

  function hideModal() {
    currentModal = null;
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

  events.subscribe(async ($events) => {
    await tick(); // Wait for DOM updates

    if (firstEoseReceived && !masonry) {
      initializeMasonry();
    } else if (masonry) {
        masonry.reloadItems();
      masonry.layout();
    }
  });

  function initializeMasonry() {
    masonry = new Masonry('#events', {
      itemSelector: '.event',
      percentPosition: true,
      horizontalOrder: true
    });
  }

  const connect = async () => {
    const relay = await Relay.connect('wss://history.nostr.watch').catch(connect);
    relay.subscribe(
      [
        {
          limit: 1000,
          kinds: [30066],
          authors: ['cd18a5109bd5a3110e173331d873725dbf0c5bedc9357a3cc80ed7029b24e974'],
          since
        }
      ],
      {
        onevent(event) {  
          if(firstEoseReceived && event.created_at < since) return
          const processedEvent = processEvent(event);
          since = event.created_at
          if (processedEvent) {
            events.update(currentEvents => {
              return [processedEvent, ...currentEvents].filter((v, i, a) => a.findIndex(t => (t.dTag === v.dTag)) === i);
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
      relay.close();
    };
  });

   function processBatch() {
    if (!firstEoseReceived) firstEoseReceived = true;  
    events.update(currentEvents => [...currentEvents]);
  }

  function calculateDimensions(event) {
    // Default dimension and RTT scaling factor
    const defaultDimension = 50; // Base size of the block
    const rttScalingFactor = 0.05; // Determines how much RTT affects the size

    // Check if the event has RTT data
    if (event.tags && Array.isArray(event.tags)) {
      const rttValues = event.tags.filter(tag => tag[0] === 'rtt').map(tag => parseInt(tag[2], 10));
      const totalRTT = rttValues.reduce((acc, rtt) => acc + rtt, 0);
      return defaultDimension + (totalRTT * rttScalingFactor);
    } else {
      return defaultDimension;
    }
  }

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


  function generateColorFromTag(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash &= hash; // Convert to 32bit integer
    }

    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 255;
        // Normalize the value to get a pastel color
        value = (value % 128) + 127; // Ensure the color is always light
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
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
    if (value.toLowerCase() === 'true')
        return true;
    if (value.toLowerCase() === 'false')
        return false;
    const asFloat = parseFloat(value);
    if (!isNaN(asFloat) && isFinite(asFloat)) {
        return asFloat;
    }
    return value;
}



  function generateBackground(event) {
    const dTag = event.tags.find(tag => tag[0] === 'd');
    return dTag ? generateColorFromTag(dTag[1]) : '#defaultColor';
  }

  window.addEventListener('resize', () => {
    if (masonry) {
      masonry.layout();
    }
  });
</script>

{#if firstEoseReceived}
  <div id="stats">
    <div id="online" class="metric">
      <span class="key">online</span>
      <span class="value">{$events.length}</span>
    </div>
    <div id="readable" class="metric">
      <span class="key">readable</span>
      <span class="value">{$events.filter(event => event.tags.filter( tag => tag[0] === 'rtt' && tag[1] === 'read').length > 0 ).length}</span>
    </div>
    <div id="writable" class="metric">
      <span class="key">writable</span>
      <span class="value">{$events.filter(event => event.tags.filter( tag => tag[0] === 'rtt' && tag[1] === 'write').length > 0 ).length}</span>
    </div>
  </div>
  <main class="main section">
    <div id="events">
      
      {#each $events as ev (ev.id)}
        <div class="event" 
            style={`height: ${ev.dimension}px; background-color: ${ev.backgroundColor};`} 
            in:fade 
            on:click={() => showModal(ev.id)} 
            role="button" 
            tabindex="0" 
            on:keydown={(event) => event.key === 'Enter' && showModal(ev.id)}>
          <span class="rtt">{rttDisplay('open', ev)}</span>
          <span class="rtt">{rttDisplay('read', ev)}</span>
          <span class="rtt">{rttDisplay('write', ev)}</span>
        </div>
        {#if currentModal === ev.id}
          <Modal showModal={true} on:close={hideModal}>
            <pre>{JSON.stringify(parse30066(ev), null, 4)}</pre>
          </Modal>
        {/if}
      {/each}
    </div>
  </main>
{:else}
  <div id="loading">loading</div>
{/if}

<style>
  body, html, :root { 
    background-color:white; 
    margin:0;
    padding:0;
  }
  .main.section {
    position: fixed !important; /* Ensure it's fixed to the viewport */
    top: 0px;
    left: 0px;
    right: 0px;
    bottom: 0px;
    overflow: hidden;  /* Prevent scrollbars within this section */
    z-index: 1;  /* Ensure it's above other content */
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
    font-family: monospace
  }

  #loading { 
    font-size:50em;
    color:rgba(0,0,0,0.05)
  }

  #stats {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    display: flex; /* Use flex display */
    align-items: center; /* Align items vertically in the center */
    justify-content: center; /* Center the items horizontally (if needed) */
    color: rgba(0, 0, 0, 0.5);
    transform: translateY(-50%); /* Adjust top positioning to truly center */
  }

  #stats .metric {
    width: 33%;
    display: flex; /* Use flex display */
    flex-direction: column; /* Stack children vertically */
    justify-content: center; /* Center the content vertically */
    text-align: center;
  }


  #stats .metric > * {
    display:block;
  }

  #stats .metric .key {
    font-size:5em
  }

  #stats .metric .value {
    font-size:20em
  }
</style>