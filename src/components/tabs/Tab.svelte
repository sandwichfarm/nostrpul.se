<script>
  export let title;
  export let active = false;
  export let onTabSelected;
</script>

<div class="tab" class:active={active} on:click={onTabSelected}>
  {title}
</div>

<style>
  .tab {
    padding: 10px 20px;
    cursor: pointer;
  }
  .tab.active {
    background-color: #f0f0f0;
  }
</style>
