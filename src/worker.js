import { NostrFetcher } from "nostr-fetch";
import { Relay, SimplePool } from "nostr-tools";

const RelayPool = new SimplePool();
const events = new Map()
const monitors = new Set()

const BATCH_SIZE = 5

let isSyncing = false;
let isSeeding = false;
let isSeeded = false;

function chunkArray(array, chunkSize) {
  if (!Array.isArray(array)) {
      throw new TypeError('First argument must be an array');
  }

  if (chunkSize <= 0 || isNaN(chunkSize)) {
      throw new RangeError('Chunk size must be a positive number');
  }

  const result = [];
  
  for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
  }
  
  return result;
}

const sync = async (message) => {
  if(isSyncing){
    return;
  }
  isSyncing = true;
  const { authors, since, relays } = message;
  RelayPool.subscribeMany(
    [...relays],
    [
      {
        limit: 10000,
        kinds: [30166],
        authors: [...authors],
        since,
      }
    ],
    {
      onevent(event) {
        self.postMessage({ type: 'event', event }); 
      },
      onclose() {
        isSyncing = false;  
        const reconnect = 2000;
        setTimeout(sync, reconnect);
      },
      oneose() {
        self.postMessage({ type: 'eose' });
      },
    },
  )
}

const seed = async (message) => {
  if(isSeeding || isSeeded){
    return;
  }
  isSeeding = true;
  const { authors, since, relays } = message;
  const fetcher = NostrFetcher.init();
  const iter = fetcher.allEventsIterator(
    relays,
    {
      kinds: [30166]
    },
    { since },
    { skipVerification: true },
  );

  const events = new Map();
  let batch = [];

  for await (const event of iter) {
    const url = event.tags.filter(t => t[0] === 'd')?.[0]?.[1];
    if (!url) {
      continue;
    }

    if(!monitors.has(event.pubkey)){
      monitors.add(event.pubkey)
    }

    if (events.has(url)) {
      continue;
    }

    events.set(url, event);
    batch.push(event);

    if (batch.length === BATCH_SIZE) {
      // console.log(`sent ${BATCH_SIZE} events`);
      // console.log('w: mon: ', Array.from(monitors).length)
      self.postMessage({ type: 'events', events: batch, monitors: Array.from(monitors) });
      batch = [];
    }
  }
  
  if (batch.length > 0) {
    console.log(`sent remaining ${batch.length} events`);
    self.postMessage({ type: 'events_excess', events: batch });
  }

  console.log(`worker found ${events.size} events from ${monitors.size} monitors`);
  self.postMessage({ type: 'eose', monitors: Array.from(monitors) });

  isSeeding = false;
  isSeeded = true;
};

self.onmessage = async (event) => {
  const { type } = event.data;

  if(type === 'seed') {
    seed(event.data);
  }

  if(type === 'sync'){
    sync(event.data);
  }

};