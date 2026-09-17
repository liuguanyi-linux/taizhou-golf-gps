/* Deterministic synthetic grid fixture, never a real course or survey asset. Prints JSON only. */
const zlib=require('node:zlib');
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
function chunk(t,b){const tag=Buffer.from(t),out=Buffer.alloc(12+b.length);out.writeUInt32BE(b.length);tag.copy(out,4);b.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([tag,b])),8+b.length);return out;}
const size=600,raw=Buffer.alloc(size*(size*3+1));for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*(size*3+1)+1+x*3,grid=x%60<2||y%60<2,color=grid?[246,232,187]:x>200&&x<400?[121,173,78]:[48,91,58];raw[i]=color[0];raw[i+1]=color[1];raw[i+2]=color[2];}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const geo=(x,y)=>[121.098+x/600*.004,31.202-y/600*.004];
const h={n:1,par:4,tees:{black:geo(300,500)},flag:geo(300,100),pins:{mid:geo(300,100)},green:[geo(250,60),geo(350,60),geo(350,140),geo(250,140)],fairway:[geo(240,140),geo(360,140),geo(370,500),geo(230,500)],holeperim:[geo(60,60),geo(540,60),geo(540,540),geo(60,540)],cart_route:[geo(150,500),geo(150,300),geo(150,100)],device_points:[],visual:{asset_id:'fixture-grid',width:600,height:600,controls:[[60,60],[540,60],[60,540],[540,540]].map(([x,y],i)=>({id:'control-'+i,pixel:{x,y},coordinate:geo(x,y),source:'synthetic_test',accuracy_m:null})),checkpoints:[]}};
console.log(JSON.stringify({format:'golf-project/1',field_verified:false,course:{name:'合成图项目验收（非实测）',center:[121.1,31.2],coordinate_system:'WGS84',holes:[h,{n:2,par:3,tees:{},device_points:[],cart_route:[]}]},assets:{'fixture-grid':{data:'data:image/png;base64,'+png.toString('base64')}}}));
