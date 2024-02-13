<script>
  import { writable } from 'svelte/store';
  import Tab from './Tab.svelte';

  export let tabs = [];
  let activeTab = tabs[0]?.title;
  const activeContent = writable('');

  $: activeContent.set(tabs.find(tab => tab.title === activeTab)?.content);

  function selectTab(tabTitle) {
    activeTab = tabTitle;
  }
</script>

<div class="tabs">
  {#each tabs as tab}
    <Tab {tab.title} active={tab.title === activeTab} onTabSelected={() => selectTab(tab.title)} />
  {/each}
</div>

<div class="tab-content">
  <svelte:component this={$activeContent} />
</div>

<style>
  .tabs {
    display: flex;
    justify-content: space-around;
    border-bottom: 1px solid #ccc;
  }
  .tab-content {
    padding: 20px;
  }
</style>
