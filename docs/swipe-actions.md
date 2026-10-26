# Swipe actions in the product list

Swipe left reveals two compact rounded actions: yellow Edit and red Dispose. The existing card remains 94px minimum height, with no extra visible row. Swipe right or tap outside closes the actions. Only one item can be open. Arrow Left opens actions for keyboard users; Arrow Right/Escape closes them. Ordinary card activation still opens details/editing.

The gesture waits for a clear horizontal intent and leaves vertical scrolling to the browser (touch-action: pan-y). Small movements do not open actions. Releasing beyond half the action width opens them; a cancelled gesture closes them. No amount of swiping disposes a product.

Dispose opens a short confirmation with the product name and quantity, initially focusing Cancel. Confirmation reuses the existing disposal handler and database permissions. Busy state blocks duplicate submissions. No schema or expiry calculation changes.

Validation: configured production build includes the swipe UI; all 21 node tests pass, including vertical intent, movement bounds, reverse swipe, threshold and cancellation tests. Device/browser visual and touch verification remains outstanding. Main production is unchanged until publication approval.
