/* shared brick wall + pixel grain (sets --wall / --grain on :root; fills #grain if present) */
(function(){
  function wall(){var c=document.createElement('canvas');c.width=32;c.height=16;var x=c.getContext('2d');x.fillStyle='#0c0705';x.fillRect(0,0,32,16);
    var pal=['#2a1d17','#30221a','#26191a','#2d2019','#22171a'],seed=7;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}
    for(var r=0;r<2;r++){var off=r?8:0;for(var b=-1;b<3;b++){var bx=off+b*16;x.fillStyle=pal[Math.floor(rnd()*pal.length)];x.fillRect(bx+1,r*8+1,14,7);x.fillStyle='rgba(255,200,140,.07)';x.fillRect(bx+1,r*8+1,14,1);
      if(rnd()<.5){x.fillStyle='rgba(0,0,0,.25)';x.fillRect(bx+3+Math.floor(rnd()*8),r*8+3+Math.floor(rnd()*3),2,1)}}}
    return 'url('+c.toDataURL()+')'}
  function grain(){var c=document.createElement('canvas');c.width=c.height=80;var x=c.getContext('2d');var seed=5;function rnd(){seed=(seed*9301+49297)%233280;return seed/233280}
    for(var y=0;y<80;y++)for(var xx=0;xx<80;xx++){var r=rnd();if(r<.20){x.fillStyle='rgba(0,0,0,.16)';x.fillRect(xx,y,1,1)}else if(r<.30){x.fillStyle='rgba(255,235,200,.075)';x.fillRect(xx,y,1,1)}else if(r<.305){x.fillStyle='rgba(255,220,160,.20)';x.fillRect(xx,y,1,1)}}
    return 'url('+c.toDataURL()+')'}
  try{var w=wall(),g=grain(),d=document.documentElement;d.style.setProperty('--wall',w);d.style.setProperty('--grain',g);
    var el=document.getElementById('grain');if(el)el.style.backgroundImage=g}catch(e){}
})();
