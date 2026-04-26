
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { MB } = require("./dist");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const DATA_FILE = path.join(__dirname,"data.json");

const BANK = "MB";
const STK = "0975868667";
const USERNAME = "0975868667";
const PASSWORD = "Phamquangvuong@123";

function loadData(){
 if(!fs.existsSync(DATA_FILE)){
   fs.writeFileSync(DATA_FILE,JSON.stringify([],null,2));
   return [];
 }
 try{
   return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
 }catch{
   return [];
 }
}

let payments = loadData();

function saveData(){
 fs.writeFileSync(DATA_FILE,JSON.stringify(payments,null,2));
}

let mb=null;
let lastLogin=0;

async function initMB(){
 if(!mb || Date.now()-lastLogin>5*60*1000){
   mb=new MB({
      username:USERNAME,
      password:PASSWORD
   });

   console.log("Login MB...");
   await mb.login();
   console.log("Login thành công");

   lastLogin=Date.now();
 }
}

function formatDate(d){
 return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

function normalizeText(text=""){
 return text
 .toLowerCase()
 .replace(/\s+/g,"")
 .replace(/[^a-z0-9]/g,"");
}

async function getHistory(){
 await initMB();

 try{
   const balance=await mb.getBalance();
   const acc=balance?.balances?.[0]?.number;

   if(!acc) return [];

   const today=new Date();
   const from=new Date();
   from.setDate(today.getDate()-3);

   const history=await mb.getTransactionsHistory({
      accountNumber:acc,
      fromDate:formatDate(from),
      toDate:formatDate(today)
   });

   return history||[];

 }catch(e){
   console.log("History lỗi:",e.message);
   return [];
 }
}

//======================
// TẠO ĐƠN
// /api?nap=30000
//======================
app.get("/api",(req,res)=>{

 if(req.query.nap===undefined){
   return res.status(400).json({
      error:"Dùng /api?nap=30000"
   });
 }

 const amount=Number(req.query.nap);

 if(!Number.isFinite(amount)||amount<=0){
   return res.status(400).json({
      error:"nap phải là số hợp lệ"
   });
 }

 const note="nap"+Date.now();

 const qr=`https://img.vietqr.io/image/${BANK}-${STK}-compact2.png?amount=${amount}&addInfo=${note}`;

 const order={
   note,
   amount,
   status:"pending",
   createdAt:Date.now()
 };

 payments.push(order);
 saveData();

 res.json({
   qr,
   note,
   amount
 });

});

//======================
// THỐNG KÊ ĐƠN
// /api/order
//======================
app.get("/api/order",(req,res)=>{

 const pending=
 payments.filter(p=>p.status==="pending").length;

 const paidOrders=
 payments.filter(p=>p.status==="paid");

 const paid=paidOrders.length;

 const revenue=
 paidOrders.reduce(
 (sum,p)=>sum+p.amount,
 0
 );

 res.json({
   all_orders:payments.length,
   pending_orders:pending,
   completed_orders:paid,
   revenue,
   data:payments
 });

});

//======================
// CHECK
//======================
app.get("/check",async(req,res)=>{

try{

 const note=req.query.note;

 if(!note){
   return res.json({
      status:"missing_note"
   });
 }

 const payment=
 payments.find(p=>p.note===note);

 if(!payment){
   return res.json({
      status:"not_found"
   });
 }

 if(payment.status==="paid"){
   return res.json({
      status:"paid"
   });
 }

 const history=await getHistory();

 const found=history.find(tx=>{

   const desc=
   normalizeText(
      tx.transactionDesc
   );

   return desc.includes(
      normalizeText(note)
   );

 });

 if(found){
   payment.status="paid";
   saveData();
 }

 res.json({
   status:payment.status
 });

}catch(e){

 res.json({
   status:"error",
   message:e.message
 });

}

});

//======================
// AUTO CHECK
//======================
setInterval(async()=>{

 if(!payments.length) return;

 try{

   const history=await getHistory();
   let changed=false;

   payments.forEach(p=>{

      if(p.status!=="pending") return;

      const found=history.find(tx=>{

         const desc=
         normalizeText(
            tx.transactionDesc
         );

         return desc.includes(
            normalizeText(p.note)
         );

      });

      if(found){
         p.status="paid";
         changed=true;
         console.log("Đã nhận:",p.note);
      }

   });

   if(changed){
      saveData();
   }

 }catch(e){
   console.log(
     "Auto lỗi:",
     e.message
   );
 }

},5000);

app.listen(PORT,()=>{
 console.log(
   "Running http://localhost:"+PORT
 );
});
