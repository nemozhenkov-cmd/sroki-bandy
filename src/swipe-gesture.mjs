export const ACTION_WIDTH=156;
export function swipeIntent(dx,dy){
 if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx))return 'scroll';
 if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.3)return 'pending';
 return 'swipe';
}
export const swipeOffset=(base,dx)=>Math.max(-ACTION_WIDTH,Math.min(0,base+dx));
export const shouldOpen=(offset,cancelled=false)=>!cancelled&&offset<-ACTION_WIDTH/2;
