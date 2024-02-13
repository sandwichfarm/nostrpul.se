<script>
  export let showModal;
  export let ev;
  let dialog;

  $: if (dialog) {
    showModal ? dialog.showModal() : dialog.close();
  }
</script>

<dialog
  bind:this={dialog}
  on:close={() => (showModal = false)}
  on:click|self={() => dialog.close()}
  role="button"
  tabindex="0" 
  on:keydown={(event) => event.key === 'Enter' &&  dialog.close()}>
  <div on:click|stopPropagation>
    {#if ev}
    <div id="modal-header" style="background-color: {ev? ev?.backgroundColor: ''}">
      <slot name="header" />
    </div>
    {/if}
    <slot />
    <button autofocus on:click={() => showModal = false}>Close Modal</button>
  </div>
</dialog>

<style>
	dialog {
		max-width: 64em;
		border-radius: 0.2em;
		border: none;
		padding: 0;
    color:black;
    background: rgba(255,255,255, 0.9);
	}
	dialog::backdrop {
		background: rgba(255,255,255, 0.66);
	}
	dialog > div {
		padding: 0;
	}
	dialog[open] {
		animation: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes zoom {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}
	dialog[open]::backdrop {
		animation: fade 0.2s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	button {
		display: block;
	}

  #modal-header {
    display:block;
    padding:1em;
    font-size:clamp(1.2rem, 1.5vw, 2em);
    overflow:hidden;
  }

  :global(.main::-webkit-scrollbar) {
    width: 0.25rem
  }

  :global(.main::-webkit-scrollbar-track) {
    background: #fff;
  }

  :global(.main::-webkit-scrollbar-thumb) {
    color: #fff
  }
</style>