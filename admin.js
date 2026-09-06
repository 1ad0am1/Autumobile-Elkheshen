const $=id=>document.getElementById(id);
let products=[], selectedImages=[], password='';
function enc(v){return btoa(unescape(encodeURIComponent(String(v||''))))}
async function api(url,opt={}){
 const headers={...(opt.headers||{})};
 if(!opt.skipAuth) headers['x-admin-password-b64']=enc(password);
 let r;
 try{r=await fetch(url,{...opt,headers})}catch(e){throw new Error('تعذر الاتصال بالخادم: '+e.message)}
 let text=await r.text(), data;
 try{data=JSON.parse(text)}catch{data={error:text||'استجابة غير صالحة'}}
 if(!r.ok) throw new Error((data&&data.error)||`تعذر تنفيذ الطلب (${r.status})`);
 return data;
}
function msg(t,ok=false){$('msg').textContent=t;$('msg').style.color=ok?'#18733d':'#c62828'}
async function health(){
 try{let d=await api('/api/health',{skipAuth:true});msg('الاتصال بالخادم يعمل ✓',true);return d}catch(e){msg(e.message);throw e}
}
$('healthBtn').onclick=()=>health().catch(()=>{});
$('loginBtn').onclick=login;
$('password').onkeydown=e=>{if(e.key==='Enter')login()};
async function login(){
 password=$('password').value;
 if(!password){msg('اكتب كلمة المرور أولاً');return}
 try{
   await api('/api/admin/products');
   sessionStorage.setItem('admin_password',password);
   $('login').style.display='none';$('app').style.display='block';msg('');
   await load();
 }catch(e){msg(e.message)}
}
async function load(){
 try{
  let d=await api('/api/admin/products'); products=Array.isArray(d)?d:(d.products||[]);
  render();
 }catch(e){alert(e.message)}
}
function render(){
 let q=$('search').value.trim().toLowerCase();
 let list=products.filter(x=>(x.name||'').toLowerCase().includes(q));
 $('total').textContent=products.length;
 $('available').textContent=products.filter(x=>x.status!=='sold').length;
 $('sold').textContent=products.filter(x=>x.status==='sold').length;
 $('cars').innerHTML=list.map(x=>{
  let im=(x.images&&x.images[0])||x.image||'/assets/logo.jpg';
  return `<div class="car"><img src="${esc(im)}"><div><b>${esc(x.name||'بدون اسم')}</b><div class="muted">${esc(x.price||'')} ${esc(x.year||'')}</div><span class="status ${x.status==='sold'?'danger':'ok'}">${x.status==='sold'?'مباعة':'متاحة'}</span></div><div class="actions"><button class="small" onclick="editCar('${esc(x.id)}')">تعديل</button><button class="small danger" onclick="deleteCar('${esc(x.id)}')">حذف</button></div></div>`
 }).join('')||'<div class="muted">لا توجد سيارات.</div>';
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
$('search').oninput=render;
$('images').onchange=e=>{
 [...e.target.files].forEach(f=>{let r=new FileReader();r.onload=()=>{selectedImages.push(r.result);preview()};r.readAsDataURL(f)});
 e.target.value='';
};
function preview(){$('preview').innerHTML=selectedImages.map((s,i)=>`<div class="thumb"><img src="${s}"><button onclick="selectedImages.splice(${i},1);preview()">×</button></div>`).join('')}
$('save').onclick=save;
$('cancel').onclick=reset;
async function save(){
 let id=$('id').value;
 let p={id:id||undefined,name:$('name').value.trim(),price:$('price').value.trim(),year:$('year').value.trim(),transmission:$('transmission').value.trim(),fuel:$('fuel').value.trim(),description:$('description').value.trim(),images:selectedImages,status:'available'};
 if(!p.name){alert('اكتب اسم السيارة');return}
 try{
  await api(id?`/api/admin/products/${encodeURIComponent(id)}`:'/api/admin/products',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  alert('تم الحفظ بنجاح');reset();await load();
 }catch(e){alert(e.message)}
}
window.editCar=function(id){
 let x=products.find(p=>String(p.id)===String(id));if(!x)return;
 $('id').value=x.id||'';$('name').value=x.name||'';$('price').value=x.price||'';$('year').value=x.year||'';$('transmission').value=x.transmission||'';$('fuel').value=x.fuel||'';$('description').value=x.description||'';selectedImages=[...(x.images||[])];preview();$('formTitle').textContent='تعديل سيارة';$('cancel').style.display='block';scrollTo({top:0,behavior:'smooth'});
}
window.deleteCar=async function(id){
 if(!confirm('هل أنت متأكد من حذف السيارة؟'))return;
 try{await api('/api/admin/products/'+encodeURIComponent(id),{method:'DELETE'});await load()}catch(e){alert(e.message)}
}
function reset(){$('id').value='';$('name').value='';$('price').value='';$('year').value='';$('transmission').value='';$('fuel').value='';$('description').value='';selectedImages=[];preview();$('formTitle').textContent='إضافة سيارة';$('cancel').style.display='none'}
$('logout').onclick=()=>{sessionStorage.removeItem('admin_password');password='';location.reload()}
password=sessionStorage.getItem('admin_password')||'';
if(password){login()}
