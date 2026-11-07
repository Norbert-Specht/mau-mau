/* ==========================================================================
   App entry point
   Placeholder for step 1 (engine only). The table UI is built in step 2.
   ========================================================================== */

/**
 * Renders a placeholder message into the #app root.
 * @returns nothing
 */
function renderPlaceholder(): void {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (root) root.textContent = 'Mau-Mau — engine ready, UI coming in step 2.';
}

renderPlaceholder();
