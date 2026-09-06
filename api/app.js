const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEFAULT_PRODUCTS = [
  { id:'mercedes-c200', name:'مرسيدس C200', price:2350000, year:'2022', category:'sedan', transmission:'أوتوماتيك', fuel:'بنزين', badge:'مميز', description:'سيارة سيدان فاخرة بتجهيزات مميزة وحالة ممتازة. تواصل معنا لمعرفة التفاصيل الكاملة.', image:'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1000&q=85', images:['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1000&q=85'] },
  { id:'bmw-320', name:'BMW 320', price:2100000, year:'2021', category:'sedan', transmission:'أوتوماتيك', fuel:'بنزين', badge:'فرصة', description:'BMW 320 بتصميم رياضي وتجهيزات مريحة. اسأل عن الحالة والمواصفات.', image:'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1000&q=85', images:['https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1000&q=85'] },
  { id:'audi-a6', name:'Audi A6', price:2750000, year:'2023', category:'sedan', transmission:'أوتوماتيك', fuel:'بنزين', badge:'حديث', description:'Audi A6 بمظهر فاخر ومساحة داخلية مريحة. للاستفسار تواصل معنا.', image:'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1000&q=85', images:['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1000&q=85'] },
  { id:'hyundai-tucson', name:'هيونداي توسان', price:1450000, year:'2021', category:'suv', transmission:'أوتوماتيك', fuel:'بنزين', badge:'الأكثر طلبًا', description:'SUV عملية ومناسبة للاستخدام اليومي والعائلي. تواصل لمعرفة التجهيزات.', image:'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1000&q=85', images:['https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1000&q=85'] }
];

function decodeAdminPassword(req){
  const encoded=req.headers['x-admin-password-b64'];
  if(encoded){
    try{return Buffer.from(String(encoded),'base64').toString('utf8');}catch{}
  }
  return req.headers['x-admin-password'] || '';
}
function auth(req,res,next){
  if(!ADMIN_PASSWORD) return res.status(500).json({error:'لم يتم ضبط ADMIN_PASSWORD على Vercel.'});
  if(decodeAdminPassword(req) !== ADMIN_PASSWORD) return res.status(401).json({error:'كلمة المرور غير صحيحة.'});
  next();
}
const GH_API='https://api.github.com';
function githubConfig(){return {token:process.env.GITHUB_TOKEN,repo:process.env.GITHUB_REPO,branch:process.env.GITHUB_BRANCH||'main',path:process.env.GITHUB_PRODUCTS_PATH||'data/products.json'};}
async function githubRequest(url,options={}){
  const cfg=githubConfig();
  if(!cfg.token||!cfg.repo) throw new Error('اضبط GITHUB_TOKEN و GITHUB_REPO في Vercel أولًا.');
  const headers={'Accept':'application/vnd.github+json','Authorization':`Bearer ${cfg.token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...(options.headers||{})};
  const response=await fetch(url,{...options,headers});
  const text=await response.text(); let data=null; try{data=JSON.parse(text)}catch{}
  if(!response.ok) throw new Error(data?.message||`GitHub API error ${response.status}`);
  return data;
}
async function readProducts(){
  const cfg=githubConfig(); if(!cfg.token||!cfg.repo) return DEFAULT_PRODUCTS;
  try{
    const data=await githubRequest(`${GH_API}/repos/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`);
    const products=JSON.parse(Buffer.from(data.content.replace(/\n/g,''),'base64').toString('utf8'));
    if(!Array.isArray(products)) throw new Error('ملف المنتجات غير صالح.');
    return products.map(normalizeProduct);
  }catch{return DEFAULT_PRODUCTS;}
}
async function writeProducts(products,message){
  const cfg=githubConfig(); if(!cfg.token||!cfg.repo) throw new Error('اضبط GITHUB_TOKEN و GITHUB_REPO في Vercel أولًا.');
  let sha=null;
  try{const current=await githubRequest(`${GH_API}/repos/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`);sha=current.sha;}catch{}
  const content=Buffer.from(JSON.stringify(products,null,2),'utf8').toString('base64');
  const body={message:message||'Update products',content,branch:cfg.branch}; if(sha) body.sha=sha;
  return githubRequest(`${GH_API}/repos/${cfg.repo}/contents/${cfg.path}`,{method:'PUT',body:JSON.stringify(body)});
}

function githubRawUrl(path){
  const cfg=githubConfig();
  return `https://raw.githubusercontent.com/${cfg.repo}/${encodeURIComponent(cfg.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
async function uploadFileToGithub(file){
  const cfg=githubConfig();
  if(!cfg.token||!cfg.repo) throw new Error('اضبط GITHUB_TOKEN و GITHUB_REPO في Vercel أولًا.');
  const ext=(file.originalname.match(/\.[a-zA-Z0-9]+$/)||[''])[0].toLowerCase();
  const safeExt=['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)?ext:'.jpg';
  const base=String(file.originalname||'image').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'image';
  const filename=`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}${safeExt}`;
  const path=`uploads/${filename}`;
  const content=file.buffer.toString('base64');
  await githubRequest(`${GH_API}/repos/${cfg.repo}/contents/${path}`,{
    method:'PUT',
    body:JSON.stringify({message:`Upload product image ${filename}`,content,branch:cfg.branch})
  });
  return githubRawUrl(path);
}

function normalizeProduct(p){
  const images=Array.isArray(p.images)&&p.images.length?p.images.filter(Boolean).map(String):[p.image].filter(Boolean);
  return {...p,image:String(p.image||images[0]||''),images};
}
function cleanProduct(body,old={}){
  const name=String(body.name??old.name??'').trim();
  const price=Number(body.price??old.price??0);
  const bundleQty=Number(body.bundleQty??old.bundleQty??0);
  const bundlePrice=body.bundlePrice===''||body.bundlePrice==null?undefined:Number(body.bundlePrice);
  let rawImages=body.images;
  let images=[];
  if(Array.isArray(rawImages)) images=rawImages;
  else if(typeof rawImages==='string') images=rawImages.split(/\r?\n|,/);
  images=images.map(x=>String(x||'').trim()).filter(Boolean);
  const single=String(body.image??old.image??'').trim();
  if(!images.length&&single) images=[single];
  if(!images.length&&Array.isArray(old.images)) images=old.images.filter(Boolean);
  if(!images.length) throw new Error('أضف رابط صورة واحد على الأقل.');
  if(!name) throw new Error('اسم المنتج مطلوب.');
  if(!Number.isFinite(price)||price<0) throw new Error('السعر غير صحيح.');
  const product={id:String(body.id??old.id??'').trim()||`product-${Date.now()}`,name,price,year:String(body.year??old.year??'').trim(),category:String(body.category??old.category??'').trim(),transmission:String(body.transmission??old.transmission??'').trim(),fuel:String(body.fuel??old.fuel??'').trim(),description:String(body.description??old.description??'').trim(),image:images[0],images,status:['sold','available'].includes(String(body.status??old.status))?String(body.status??old.status):'available'};
  const badge=String(body.badge??old.badge??'').trim(); if(badge) product.badge=badge;
  if(Number.isFinite(bundleQty)&&bundleQty>0&&Number.isFinite(bundlePrice)&&bundlePrice>=0){product.bundleQty=bundleQty;product.bundlePrice=bundlePrice;}
  return product;
}
function handleError(res,err){console.error(err);return res.status(500).json({error:err?.message||'حدث خطأ أثناء حفظ المنتجات.'});}

app.get(['/api/health','/health'],(req,res)=>res.json({ok:true,service:'automobile-elkheshen-api'}));
app.get(['/api/products','/products'],async(req,res)=>{try{res.json(await readProducts())}catch(e){handleError(res,e)}});
app.get(['/api/admin/products','/admin/products'],auth,async(req,res)=>{try{res.json(await readProducts())}catch(e){handleError(res,e)}});

app.post(['/api/admin/upload-images','/admin/upload-images'],auth,upload.array('images',12),async(req,res)=>{
  try{
    const files=req.files||[];
    if(!files.length) return res.status(400).json({error:'اختر صورة واحدة على الأقل.'});
    const allowed=['image/jpeg','image/png','image/webp','image/gif'];
    for(const file of files){
      if(!allowed.includes(file.mimetype)) return res.status(400).json({error:'مسموح فقط بصور JPG وPNG وWEBP وGIF.'});
      if(file.size>2*1024*1024) return res.status(400).json({error:'حجم كل صورة يجب ألا يتجاوز 2 ميجابايت.'});
    }
    const total=files.reduce((n,f)=>n+f.size,0);
    if(total>4*1024*1024) return res.status(400).json({error:'إجمالي الصور في الرفع الواحد يجب ألا يتجاوز 4 ميجابايت.'});
    const urls=[];
    for(const file of files) urls.push(await uploadFileToGithub(file));
    res.json({ok:true,urls});
  }catch(e){handleError(res,e)}
});

app.post(['/api/admin/products','/admin/products'],auth,upload.none(),async(req,res)=>{try{const products=await readProducts();const product=cleanProduct(req.body);const i=products.findIndex(p=>p.id===product.id);if(i>=0)products[i]=product;else products.push(product);await writeProducts(products,i>=0?`Update product ${product.id}`:`Add product ${product.id}`);res.json({ok:true,product})}catch(e){handleError(res,e)}});
app.put(['/api/admin/products/:id','/admin/products/:id'],auth,upload.none(),async(req,res)=>{try{const products=await readProducts();const i=products.findIndex(p=>p.id===req.params.id);if(i<0)return res.status(404).json({error:'المنتج غير موجود.'});const product=cleanProduct({...req.body,id:req.params.id},products[i]);products[i]=product;await writeProducts(products,`Update product ${product.id}`);res.json({ok:true,product})}catch(e){handleError(res,e)}});
app.delete(['/api/admin/products/:id','/admin/products/:id'],auth,async(req,res)=>{try{const products=await readProducts();const next=products.filter(p=>p.id!==req.params.id);if(next.length===products.length)return res.status(404).json({error:'المنتج غير موجود.'});await writeProducts(next,`Delete product ${req.params.id}`);res.json({ok:true})}catch(e){handleError(res,e)}});
app.post(['/api/order','/order'],async(req,res)=>res.json({ok:true,orderId:`NN-${Date.now().toString().slice(-8)}`}));
module.exports=app;
