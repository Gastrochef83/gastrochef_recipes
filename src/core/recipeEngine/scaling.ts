// Global Scaling Engine V1
export function scaleQuantity(qty:number, fromServings:number, toServings:number){
  if(!fromServings || !toServings) return qty;
  const factor = toServings / fromServings;
  return Math.round((qty * factor) * 1000) / 1000;
}
