<script>
import { onMount, afterUpdate, tick } from 'svelte';
  import { Relay } from 'nostr-tools';
  import { fade } from 'svelte/transition';
  import Masonry from 'masonry-layout';  
  import { writable } from 'svelte/store';

  const events = writable([]);
  let loading = true;
  let masonry;
  let firstEoseReceived = false;
  let since = Math.round(Date.now() / 1000) - 60 * 60

  function processEvent(event) {
    const dTag = event.tags.find(tag => tag[0] === 'd');
    if (!dTag) return null; // Skip if no 'd' tag

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
    masonry = new Masonry('.main', {
      itemSelector: '.event',
      percentPosition: true,
      horizontalOrder: true
    });
  }

  onMount(async () => {
    const relay = await Relay.connect('wss://history.nostr.watch');

    relay.subscribe(
      [
        {
          kinds: [30066],
          authors: ['151c17c9d234320cf0f189af7b761f63419fd6c38c6041587a008b7682e4640f'],
          since
        }
      ],
      {
        onevent(event) {
          const processedEvent = processEvent(event);
          if (processedEvent) {
            events.update(currentEvents => {
              // Add new event and filter out duplicates
              return [processedEvent, ...currentEvents].filter((v, i, a) => a.findIndex(t => (t.dTag === v.dTag)) === i);
            });
          }
          if(!firstEoseReceived) return 
          processBatch()
          console.log(event.id)
        },
        onclose() {
          console.log('Subscription closed');
        },
        oneose() {
          console.log('EOSE')
          processBatch();
          firstEoseRecieved=true
        }
      }
    );

    // return () => {
    //   relay.close();
    // };
  });

   function processBatch() {
    if (!firstEoseReceived) firstEoseReceived = true;  
    events.update(currentEvents => [...currentEvents]);
  }

  // afterUpdate(() => {
  //   if (masonry) {
  //     masonry.reloadItems();
  //     masonry.layout();
  //   } else {
  //     masonry = new Masonry('.main', {
  //       itemSelector: '.event',
  //       percentPosition: true,
  //       horizontalOrder: true
  //     });
  //   }
  // });

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
  <main class="main section">
    {#each $events as event (event.id)}
      <div class="event" style={`height: ${event.dimension}px; background-color: ${event.backgroundColor};`} in:fade>
        <!-- Event content here -->
      </div>
    {/each}
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
    position: fixed; /* Ensure it's fixed to the viewport */
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
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

  #loading { 
    font-size:50em;
    color:rgba(0,0,0,0.05)
  }
</style>