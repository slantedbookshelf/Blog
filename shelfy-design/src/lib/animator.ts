export class ShelfyAnimator {
 private animations = new Set<Animation>();
 private timer?: Animation;
 private busy = false;
 paused = false;
 private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(private root: Element) { this.reset(); }
 private part(name:string) { return this.root.querySelector(`[data-part="${name}"]`)!; }
 private animate(el:Element, frames:Keyframe[], options:KeyframeAnimationOptions) {
  const a=el.animate(frames, options); this.animations.add(a);
  a.onfinish=()=>{this.animations.delete(a);};
  if(this.paused) a.pause(); return a;
 }
 private schedule(){
  this.timer=this.animate(this.root,[{},{}],{duration:3000+Math.random()*4000});
  this.timer.onfinish=()=>{this.animations.delete(this.timer!);this.blink();this.schedule();};
 }
 private clear(){this.animations.forEach(a=>{a.onfinish=null;a.cancel();});this.animations.clear();}
 reset(){this.clear();this.busy=false;this.part('eyes').setAttribute('opacity','1');this.part('happy-eyes').setAttribute('opacity','0');this.idle();}
 private idle(){
  if(this.reduced)return;
  this.animate(this.part('body'),[{transform:'rotate(6deg)'},{transform:'rotate(4.8deg)'},{transform:'rotate(7deg)'},{transform:'rotate(6deg)'}],{duration:5400,iterations:Infinity,easing:'ease-in-out'});
  ['left-arm','right-arm'].forEach((p,i)=>this.animate(this.part(p),[{transform:'rotate(0deg)'},{transform:`rotate(${i? -3:4}deg)`},{transform:'rotate(0deg)'}],{duration:3700+i*600,iterations:Infinity,easing:'ease-in-out'}));
  this.root.querySelectorAll('[data-part="book"]').forEach((b,i)=>this.animate(b,[{transform:'rotate(0deg)'},{transform:`rotate(${i%2?.7:-.6}deg)`},{transform:'rotate(0deg)'}],{duration:4400+i*230,iterations:Infinity,easing:'ease-in-out'}));this.schedule();
 }
 blink(){if(this.busy||this.paused)return;this.busy=true;
  const double=Math.random()<.22;
  const frames=double?[1,.08,1,1,.08,1]:[1,.08,1];
  const a=this.animate(this.part('eyes'),frames.map(scaleY=>({transform:`scaleY(${scaleY})`})),{duration:double?430:180,easing:'ease-in-out'});
  a.onfinish=()=>{this.animations.delete(a);this.busy=false;};
 }
 happy(){if(this.busy||this.paused)return;this.clear();this.busy=true;
  this.part('eyes').setAttribute('opacity','0');this.part('happy-eyes').setAttribute('opacity','1');
  const duration=this.reduced?300:1800;
  const poses=['rotate(6deg)','rotate(6deg) scale(1.05,.93)','translateY(-35px) rotate(1deg) scale(.97,1.04)','translateY(-40px) rotate(0deg)','rotate(5deg) scale(1.07,.92)','rotate(6deg) scale(.99,1.02)','rotate(6deg)'];
  const a=this.animate(this.part('body'),this.reduced?[{},{}]:poses.map(transform=>({transform})),{duration,easing:'ease-in-out'});
  if(!this.reduced){['left-arm','right-arm'].forEach((p,i)=>this.animate(this.part(p),[0,i? -65:65,i? -55:55,0].map(r=>({transform:`rotate(${r}deg)`})),{duration,easing:'ease-in-out'}));
  this.root.querySelectorAll('[data-part="book"]').forEach((b,i)=>this.animate(b,[{transform:'translateY(0)'},{transform:`translateY(-${4+i%3}px) rotate(${i%2?3:-3}deg)`},{transform:'translateY(0)'}],{duration:1000,delay:250+i*30,easing:'ease-in-out'}));}
  a.onfinish=()=>this.reset();
 }
 toggle(){this.paused=!this.paused;this.animations.forEach(a=>this.paused?a.pause():a.play());}
 destroy(){this.clear();}
}
