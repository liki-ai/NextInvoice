import{S as e}from"./index-BG7XlYQQ.js";var t=e(`download`,[[`path`,{d:`M12 15V3`,key:`m9g1x1`}],[`path`,{d:`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`,key:`ih7n3h`}],[`path`,{d:`m7 10 5 5 5-5`,key:`brsn70`}]]);function n(e){let t=typeof e==`number`?e:parseFloat(String(e??``).replace(`,`,`.`));return Number.isFinite(t)?Math.round(t*100):0}function r(e){return n(e)/100}function i(e){return(e||[]).filter(e=>!e.voidedAt)}function a(e){let t=n(e?.total??e?.amount??0),r=i(e?.payments).reduce((e,t)=>e+n(t.amount),0),a=Math.max(t-r,0);return{total:t/100,amountPaid:r/100,amountDue:a/100}}function o(e){if(e?.lifecycle===`cancelled`||e?.status===`cancelled`)return`cancelled`;if(e?.lifecycle===`draft`)return`draft`;let t=a(e),r=n(e?.total??e?.amount??0),i=n(t.amountPaid);return e?.status===`paid`&&i===0||r>0&&t.amountDue===0?`paid`:i>0?`partial`:`unpaid`}function s(e){let t=o(e);return t===`draft`?`unpaid`:t}function c(e){return e?.sent===!1?!1:e?.sentAt||e?.sent===!0?!0:e?.lifecycle!==`draft`}function l(e){let t=o(e);return t===`cancelled`||t===`draft`||t===`paid`?0:a(e).amountDue}function u(e){return o(e)!==`cancelled`&&o(e)!==`draft`}var d=[`JAN`,`FEB`,`MAR`,`APR`,`MAY`,`JUN`,`JUL`,`AUG`,`SEP`,`OCT`,`NOV`,`DEC`];function f(e){if(!e)return null;let t=String(e).trim(),n=t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);if(n)return new Date(Number(n[1]),Number(n[2])-1,Number(n[3]));let r=t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(r){let e=Number(r[2])>12&&Number(r[1])<=12;return new Date(Number(r[3]),Number(r[e?1:2])-1,Number(r[e?2:1]))}let i=t.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i);if(i){let e=d.indexOf(i[1].toUpperCase());if(e>=0)return new Date(Number(i[3]),e,Number(i[2]))}let a=Date.parse(t);return Number.isFinite(a)?new Date(a):null}function p(e){return new Date(e.getFullYear(),e.getMonth(),e.getDate())}function m(e,t=new Date){let n=o(e);if(n===`paid`||n===`cancelled`||n===`draft`||l(e)<=0)return 0;let r=f(e?.dueDate);if(!r)return 0;let i=Math.floor((p(t).getTime()-p(r).getTime())/864e5);return i>0?i:0}function h(e,t=new Date){return m(e,t)>0}function g(e,t,n){let r=e?.dueDate||t.onReceipt,i=l(e).toFixed(2);return[t.hello,t.body.replace(`{number}`,e?.number||``).replace(`{due}`,r).replace(`{amount}`,i).replace(`{days}`,String(n)),t.thanks].join(`

`)}function _(e,t){let n=new Map;for(let i of e){if(!u(i))continue;let e=i.currency||`EUR`;n.set(e,r((n.get(e)||0)+t(i)))}return[...n.entries()].map(([e,t])=>({currency:e,amount:t}))}function v(e,t){return e.length?e.map(e=>t(e.amount,e.currency)).join(` · `):t(0,`EUR`)}async function y(e,t){let n=o(e);if(!(n===`cancelled`||n===`draft`)){if(n===`paid`){for(let n of i(e.payments))await t.voidPayment(e.id,n.id,`unpaid`);t.setStatus&&await t.setStatus(`unpaid`);return}if(t.payload.amount>0){await t.addPayment(e.id,t.payload);return}t.setStatus&&await t.setStatus(`paid`)}}function ee(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}var b=[`classic`,`corporate`,`minimal`],x={classic:`#2C6E7F`,corporate:`#2E75B6`,minimal:`#1D2B2E`},te=[`#2C6E7F`,`#2E75B6`,`#1D2B2E`,`#6B4FA0`,`#B4532A`,`#2E7D32`,`#A67C00`];function S(e){return b.includes(e)?e:`classic`}function C(e){return/^#[0-9a-fA-F]{6}$/.test(String(e||``))}function ne(e,t){return C(t)?t:x[e]}function w(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function T(e){let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]}function E(e,t){return`#${T(e).map(e=>Math.round(e+(255-e)*t).toString(16).padStart(2,`0`)).join(``)}`}function re(e,t){return`#${T(e).map(e=>Math.round(e*(1-t)).toString(16).padStart(2,`0`)).join(``)}`}function ie(e){let[t,n,r]=T(e);return(t*299+n*587+r*114)/1e3>165?`#1D2B2E`:`#FFFFFF`}function D(e){return(Number.isFinite(e)?e:0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,`,`)}function O(e){let t=String(e||``);return/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(t)?t:``}function ae({company:e,client:t,invoice:n,pdfLabels:r,template:i,accentColor:a}){let s=i||S(e.invoiceTemplate),c=ne(s,a??e.accentColor),u=n.items||[],{subtotal:d,total:f,taxRate:p,taxAmount:m}=G(u,n.discount,n.taxRate),h=l(n),g=h===0&&o(n)!==`draft`?f:f-h,_=L(n.currency||e.currency),v=e=>`${D(e)} ${_}`,y=[e.state,e.zipCode].map(e=>String(e||``).trim()).filter(Boolean).join(`, `);return{templateId:s,accent:c,accentInk:ie(c),L:r,company:e,client:t,invoice:n,symbol:_,money:v,cityLine:y,rows:u.map((e,t)=>({index:t+1,description:e.description,quantity:e.quantity,unitPrice:z(e.unitPrice),lineTotal:z(e.quantity)*z(e.unitPrice)})),subtotal:d,discount:z(n.discount),taxRate:p,taxAmount:m,total:f,paid:g,due:h,showBalance:h>0&&h<f,dueText:n.dueDate||r.onReceipt||``,exportNote:F(e),logo:O(e.logoData),signature:O(e.signatureData),stamp:O(e.stampData),hasPayment:!!(e.bankName||e.iban||e.swift)}}function oe(e){return`
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; background: #fff; color: #1D2B2E; font-family: ${e}; font-size: 12px; line-height: 1.45; }
    .page { padding: 32px; }
    p { margin: 0; }
    table { border-collapse: collapse; }
    thead { display: table-header-group; }
    tr, .keep { break-inside: avoid; page-break-inside: avoid; }
    .right { text-align: right; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .pre { white-space: pre-wrap; }
    @page { size: A4; margin: 12mm; }
    @media print { .page { padding: 0; } }
  `}function k(e,t,n,r){return`<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="utf-8" />
<title>${w(e.invoice.number)}</title>
<style>${oe(t)}${n}</style>
</head>
<body><div class="page">${r}</div></body>
</html>`}function A(e){let{company:t,L:n}=e;return[t.bankName?[n.bankName,t.bankName]:null,t.swift?[n.swiftLabel||`SWIFT (BIC)`,t.swift]:null,t.iban?[n.ibanLabel,t.iban]:null].filter(Boolean)}function j(e){let{client:t,L:n}=e;return[t.address,t.phone,t.email,t.businessId?`${n.nuiLabel}: ${t.businessId}`:``,t.fiscalNumber?`${n.fiscalLabel||`Fiscal No`}: ${t.fiscalNumber}`:``,t.vatNumber?`${n.vatLabel||`VAT`}: ${t.vatNumber}`:``].filter(e=>String(e||``).trim())}function se(e){let{company:t,client:n,invoice:r,L:i,accent:a,money:o}=e,s=re(a,.28);return k(e,`-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`,`
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 3px solid ${a}; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
    .logo { height: 64px; max-width: 150px; object-fit: contain; flex-shrink: 0; }
    .brand h1 { margin: 0 0 6px; font-size: 20px; color: ${s}; }
    .brand p, .client p { margin: 2px 0; color: #444; }
    .meta { text-align: right; flex-shrink: 0; }
    .meta h2 { margin: 0 0 8px; font-size: 26px; letter-spacing: 2px; color: ${a}; }
    .meta p { margin: 2px 0; }
    .client { margin-bottom: 22px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
    .items { width: 100%; margin-bottom: 16px; }
    .items thead tr { background: ${a}; color: ${e.accentInk}; }
    .items th, .items td { padding: 8px 10px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 12px; vertical-align: top; }
    .items th.right, .items td.right { text-align: right; }
    .items th.center, .items td.center { text-align: center; }
    .totals { width: 270px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { font-weight: 700; font-size: 16px; border-top: 2px solid ${a}; margin-top: 4px; padding-top: 8px; color: ${s}; }
    .notes { margin-top: 20px; color: #555; }
    .payment { margin-top: 20px; color: #444; }
    .payment p { margin: 2px 0; }
    .thanks { text-align: center; margin-top: 30px; font-size: 13px; color: ${a}; font-weight: 600; }
    .law { text-align: center; margin-top: 8px; font-size: 13px; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 48px; }
    .sign { width: 38%; text-align: center; font-size: 12px; color: #555; }
    .sign .ink { height: 46px; display: flex; align-items: flex-end; justify-content: center; }
    .sign .ink img { max-height: 46px; max-width: 160px; }
    .sign .line { border-top: 1px solid #999; padding-top: 6px; }
    .stamp { width: 20%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
  `,`
    <div class="top">
      <div class="brand">
        ${e.logo?`<img class="logo" src="${e.logo}" alt="" />`:``}
        <div>
          <h1>${w(t.companyName)}</h1>
          ${t.nui?`<p>${w(i.nuiLabel)}: ${w(t.nui)}</p>`:``}
          ${t.vatNumber?`<p>${w(i.vatLabel||`VAT`)}: ${w(t.vatNumber)}</p>`:``}
          ${t.streetAddress?`<p>${w(t.streetAddress)}</p>`:``}
          ${e.cityLine?`<p>${w(e.cityLine)}</p>`:``}
          ${t.email?`<p>${w(t.email)}</p>`:``}
          ${t.phone?`<p>${w(t.phone)}</p>`:``}
          ${t.website?`<p>${w(t.website)}</p>`:``}
        </div>
      </div>
      <div class="meta">
        <h2>${w(i.invoiceTitle||`INVOICE`)}</h2>
        <p>${w(i.invoiceLabel)}: <strong>${w(r.number)}</strong></p>
        <p>${w(i.dateLabel)}: ${w(r.date)}</p>
        <p>${w(i.dueDateLabel)}: ${w(e.dueText)}</p>
      </div>
    </div>
    <div class="client">
      <div class="label">${w(i.clientLabel)}</div>
      <p><strong>${w(i.fullNameLabel)}:</strong> ${w(n.fullName)}</p>
      ${n.address?`<p><strong>${w(i.addressLabel)}:</strong> ${w(n.address)}</p>`:``}
      ${n.phone?`<p><strong>${w(i.phoneLabel)}:</strong> ${w(n.phone)}</p>`:``}
      ${n.email?`<p><strong>${w(i.emailLabel||`Email`)}:</strong> ${w(n.email)}</p>`:``}
      ${n.businessId?`<p><strong>${w(i.nuiLabel)}:</strong> ${w(n.businessId)}</p>`:``}
      ${n.fiscalNumber?`<p><strong>${w(i.fiscalLabel||`Fiscal No`)}:</strong> ${w(n.fiscalNumber)}</p>`:``}
      ${n.vatNumber?`<p><strong>${w(i.vatLabel||`VAT`)}:</strong> ${w(n.vatNumber)}</p>`:``}
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>${w(i.description)}</th>
          <th class="center">${w(i.quantity)}</th>
          <th class="right">${w(i.unit)} (${w(e.symbol)})</th>
          <th class="right">${w(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="pre">${w(e.description)}</td>
          <td class="center">${w(e.quantity)}</td>
          <td class="right nowrap">${o(e.unitPrice)}</td>
          <td class="right nowrap">${o(e.lineTotal)}</td>
        </tr>`).join(``)}
      </tbody>
    </table>
    <div class="totals keep">
      <div><span>${w(i.subtotal)}</span><span>${o(e.subtotal)}</span></div>
      ${e.discount>0?`<div><span>${w(i.discount)}</span><span>-${o(e.discount)}</span></div>`:``}
      ${e.taxRate>0?`<div><span>${w(i.vat||`VAT`)} ${e.taxRate}%</span><span>${o(e.taxAmount)}</span></div>`:``}
      <div class="grand"><span>${w(i.total)}</span><span>${o(e.total)}</span></div>
      ${e.showBalance?`<div><span>${w(i.amountPaid||``)}</span><span>${o(e.paid)}</span></div><div class="grand"><span>${w(i.amountDue||i.total)}</span><span>${o(e.due)}</span></div>`:``}
    </div>
    ${r.notes?`<div class="notes pre">${w(r.notes)}</div>`:``}
    ${e.hasPayment?`<div class="payment keep"><div class="label">${w(i.paymentInfo)}</div>${A(e).map(([e,t])=>`<p>${w(e)}: ${w(t)}</p>`).join(``)}</div>`:``}
    <div class="thanks">${w(i.thankYou)}</div>
    ${e.exportNote?`<div class="law">${w(e.exportNote)}</div>`:``}
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
        <div class="line">${w(t.contactPerson)}<br/>${w(i.issuedBy)}</div>
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line">${w(n.fullName)}<br/>${w(i.receivedBy)}</div>
      </div>
    </div>
  `)}var ce=6;function le(e){let{company:t,client:n,invoice:r,L:i,accent:a,symbol:o}=e,s=E(a,.86),c=E(a,.68),l=E(a,.52),u=E(a,.3),d=e=>`<span class="cur">${w(o)}</span><span>${D(e)}</span>`,f=Math.max(ce-e.rows.length,0),p=`
    .band { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: ${a}; color: ${e.accentInk}; padding: 14px 32px; }
    .band-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .band-logo { height: 44px; max-width: 120px; object-fit: contain; background: #fff; border-radius: 4px; padding: 4px; flex-shrink: 0; }
    .band h1 { margin: 0; font-size: 25px; font-weight: 700; letter-spacing: 0.2px; }
    .band-title { font-size: 28px; font-weight: 400; white-space: nowrap; }
    .sub { display: flex; gap: 24px; justify-content: space-between; background: ${c}; padding: 14px 32px 14px 64px; font-size: 10.5px; font-weight: 700; }
    .sub td { padding: 1px 0; vertical-align: top; }
    .sub td.k { text-align: right; padding-right: 28px; white-space: nowrap; }
    .parties { display: flex; justify-content: space-between; gap: 32px; margin: 26px 0 22px; font-size: 10.5px; }
    .parties td { padding: 4px 0; vertical-align: top; font-weight: 700; }
    .parties td.k { padding-right: 16px; white-space: nowrap; }
    .items { width: 100%; border: 1.5px solid ${u}; }
    .items th { padding: 18px 8px; font-size: 15px; font-weight: 400; color: ${a}; text-align: left; border-bottom: 1.5px solid ${u}; }
    .items td { padding: 9px 8px; height: 40px; border: 1px solid ${u}; font-size: 11px; color: #555; vertical-align: middle; }
    .items.dense td { padding: 6px 8px; height: 30px; }
    .items tbody tr:nth-child(even) td { background: ${s}; }
    .items td.sum { background: ${c}; }
    .items tbody tr:nth-child(even) td.sum { background: ${l}; }
    .items .n { width: 8%; }
    .items .q { width: 9%; text-align: right; }
    .items .u { width: 17%; }
    .items .t { width: 17%; }
    .amount { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .pay { flex: 1; margin-top: 22px; background: ${s}; padding: 10px 16px; text-align: center; font-size: 12.5px; line-height: 1.6; }
    .pay strong { display: block; }
    .totals { width: 26%; min-width: 190px; }
    .totals td { padding: 4px 8px; font-size: 11px; border: 1px solid ${u}; }
    .totals td.k { text-align: right; border-left: 0; border-top: 0; border-bottom: 0; }
    .totals td.v { width: 62%; background: ${s}; }
    .totals tr:nth-child(odd) td.v { background: ${c}; }
    .totals tr.grand td { font-weight: 700; padding: 9px 8px; background: ${l}; border: 1.5px solid ${u}; }
    .notes { margin-top: 18px; color: #444; font-size: 11px; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 44px; padding: 0 64px 0 64px; font-size: 11px; }
    .sign { width: 34%; }
    .sign b { display: block; margin-bottom: 8px; }
    .sign .ink { display: flex; align-items: flex-end; gap: 10px; min-height: 48px; border-bottom: 1.5px solid #1D2B2E; padding-bottom: 4px; }
    .sign .ink img { max-height: 44px; max-width: 120px; }
    .stamp { width: 24%; text-align: center; }
    .stamp img { max-height: 110px; max-width: 120px; }
    .foot { margin-top: 22px; text-align: center; font-size: 11px; color: #555; }
    .foot b { display: block; color: #1D2B2E; margin-top: 4px; }
  `,m=A(e);return k(e,`Calibri, Carlito, "Segoe UI", -apple-system, Helvetica, Arial, sans-serif`,p,`
    <div class="band">
      <div class="band-brand">
        ${e.logo?`<img class="band-logo" src="${e.logo}" alt="" />`:``}
        <h1>${w(t.companyName)}</h1>
      </div>
      <div class="band-title">${w(i.invoiceTitle||`Invoice`)}</div>
    </div>
    <div class="sub">
      <div>
        ${t.streetAddress?`<div>${w(t.streetAddress)}</div>`:``}
        ${e.cityLine?`<div style="margin-top:4px">${w(e.cityLine)}</div>`:``}
      </div>
      <table>
        ${t.nui?`<tr><td class="k">${w(i.businessNumber||i.nuiLabel)}:</td><td>${w(t.nui)}</td></tr>`:``}
        ${t.vatNumber?`<tr><td class="k">${w(i.vatLabel||`VAT`)}:</td><td>${w(t.vatNumber)}</td></tr>`:``}
      </table>
      <div>
        ${t.phone?`<div>${w(t.phone)}</div>`:``}
        ${t.email?`<div style="margin-top:4px">${w(t.email)}</div>`:``}
        ${t.website?`<div style="margin-top:4px">${w(t.website)}</div>`:``}
      </div>
    </div>
    <div class="parties">
      <table>
        <tr><td class="k">${w(i.customer||i.clientLabel)}:</td><td>${w(n.fullName)}</td></tr>
        ${j(e).map((e,t)=>`<tr><td class="k">${t===0&&n.address?`${w(i.addressLabel)}:`:``}</td><td>${w(e)}</td></tr>`).join(``)}
      </table>
      <table>
        <tr><td class="k">${w(i.invoiceLabel)} #:</td><td>${w(r.number)}</td></tr>
        <tr><td class="k">${w(i.dateLabel)}:</td><td>${w(r.date)}</td></tr>
        <tr><td class="k">${w(i.dueDateLabel)}:</td><td>${w(e.dueText)}</td></tr>
      </table>
    </div>
    <table class="items${f?``:` dense`}">
      <thead>
        <tr>
          <th class="n">#</th>
          <th>${w(i.description)}</th>
          <th class="q">${w(i.quantity)}</th>
          <th class="u">${w(i.unit)}</th>
          <th class="t">${w(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="n">${e.index}</td>
          <td class="pre">${w(e.description)}</td>
          <td class="q">${w(e.quantity)}</td>
          <td class="u"><div class="amount">${d(e.unitPrice)}</div></td>
          <td class="t sum"><div class="amount">${d(e.lineTotal)}</div></td>
        </tr>`).join(``)}
        ${`<tr><td class="n"></td><td></td><td class="q"></td><td class="u"></td><td class="t sum"></td></tr>`.repeat(f)}
      </tbody>
    </table>
    <div class="bottom keep">
      ${e.hasPayment?`<div class="pay"><strong>${w(i.paymentDetails||i.paymentInfo)}:</strong>
              <div>${w(i.beneficiary||`Beneficiary`)}: ${w(t.companyName)}</div>
              ${m.map(([e,t])=>`<div>${w(e)}: ${w(t)}</div>`).join(``)}
            </div>`:`<div style="flex:1"></div>`}
      <table class="totals">
        <tr><td class="k">${w(i.subtotal)}</td><td class="v"><div class="amount">${d(e.subtotal)}</div></td></tr>
        <tr><td class="k">${w(i.discount)}</td><td class="v"><div class="amount">${e.discount>0?d(e.discount):`<span class="cur">${w(o)}</span><span>-</span>`}</div></td></tr>
        <tr><td class="k">${w(i.vat||`VAT`)} %</td><td class="v"><div class="amount"><span></span><span>${e.taxRate.toFixed(2)}%</span></div></td></tr>
        <tr><td class="k">${w(i.vat||`VAT`)}</td><td class="v"><div class="amount">${e.taxAmount>0?d(e.taxAmount):`<span class="cur">${w(o)}</span><span>-</span>`}</div></td></tr>
        <tr class="grand"><td class="k">${w(String(i.total||``).toUpperCase())}</td><td><div class="amount">${d(e.total)}</div></td></tr>
        ${e.showBalance?`<tr><td class="k">${w(i.amountPaid||``)}</td><td class="v"><div class="amount">${d(e.paid)}</div></td></tr>
               <tr class="grand"><td class="k">${w(i.amountDue||i.total)}</td><td><div class="amount">${d(e.due)}</div></td></tr>`:``}
      </table>
    </div>
    ${r.notes?`<div class="notes pre">${w(r.notes)}</div>`:``}
    <div class="signs keep">
      <div class="sign">
        <b>${w(i.signature||`Signature`)} (${w(t.companyName)}):</b>
        <div class="ink"><span>${w(t.contactPerson)}</span>${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <b>${w(i.signature||`Signature`)}:</b>
        <div class="ink"></div>
      </div>
    </div>
    ${e.exportNote?`<div class="foot"><b>${w(e.exportNote)}</b></div>`:``}
  `)}function ue(e){let{company:t,client:n,invoice:r,L:i,accent:a,money:o}=e,s=`#E3E7E8`,c=`#6B7A7D`,l=`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .logo { height: 56px; max-width: 180px; object-fit: contain; }
    .name { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 30px; font-weight: 300; letter-spacing: 3px; color: ${a}; }
    .title p { margin-top: 4px; font-size: 13px; color: ${c}; }
    .rule { height: 2px; background: ${a}; margin: 22px 0 24px; width: 48px; }
    .cols { display: flex; gap: 28px; margin-bottom: 30px; }
    .cols > div { flex: 1; min-width: 0; }
    .cols > div:last-child { flex: 0 0 26%; }
    .cap { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; color: ${c}; margin-bottom: 8px; }
    .cols p { margin: 2px 0; color: #444; }
    .cols p.lead { font-weight: 700; font-size: 13px; color: #1D2B2E; }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
    .kv span:first-child { color: ${c}; }
    .items { width: 100%; }
    .items th { padding: 0 8px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; color: ${c}; text-align: left; border-bottom: 1.5px solid #1D2B2E; }
    .items td { padding: 13px 8px; border-bottom: 1px solid ${s}; vertical-align: top; }
    .items th:first-child, .items td:first-child { padding-left: 0; }
    .items th:last-child, .items td:last-child { padding-right: 0; }
    .items td.t { font-weight: 600; }
    .after { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; margin-top: 18px; }
    .side { flex: 1; min-width: 0; color: #444; }
    .side .block { margin-bottom: 16px; }
    .totals { width: 44%; min-width: 230px; }
    .totals .kv { padding: 5px 0; }
    .totals .grand { margin-top: 8px; padding: 12px 0 0; border-top: 1.5px solid #1D2B2E; font-size: 19px; font-weight: 700; }
    .totals .grand span:first-child { color: #1D2B2E; }
    .totals .grand span:last-child { color: ${a}; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 52px; }
    .sign { width: 34%; font-size: 11px; color: ${c}; }
    .sign .ink { height: 46px; display: flex; align-items: flex-end; }
    .sign .ink img { max-height: 46px; max-width: 150px; }
    .sign .line { border-top: 1px solid #B9C1C3; padding-top: 6px; }
    .sign .line b { display: block; color: #1D2B2E; font-weight: 600; }
    .stamp { width: 22%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
    .foot { margin-top: 28px; padding-top: 14px; border-top: 1px solid ${s}; text-align: center; font-size: 11px; color: ${c}; }
    .foot b { display: block; margin-top: 4px; color: #1D2B2E; }
  `,u=A(e);return k(e,`"Helvetica Neue", Helvetica, "Segoe UI", -apple-system, Arial, sans-serif`,l,`
    <div class="head">
      ${e.logo?`<img class="logo" src="${e.logo}" alt="" />`:`<div class="name">${w(t.companyName)}</div>`}
      <div class="title">
        <h2>${w(i.invoiceTitle||`INVOICE`)}</h2>
        <p>${w(r.number)}</p>
      </div>
    </div>
    <div class="rule"></div>
    <div class="cols">
      <div>
        <div class="cap">${w(i.issuedBy)}</div>
        <p class="lead">${w(t.companyName)}</p>
        ${t.streetAddress?`<p>${w(t.streetAddress)}</p>`:``}
        ${e.cityLine?`<p>${w(e.cityLine)}</p>`:``}
        ${t.nui?`<p>${w(i.nuiLabel)}: ${w(t.nui)}</p>`:``}
        ${t.vatNumber?`<p>${w(i.vatLabel||`VAT`)}: ${w(t.vatNumber)}</p>`:``}
        ${t.phone?`<p>${w(t.phone)}</p>`:``}
        ${t.email?`<p>${w(t.email)}</p>`:``}
        ${t.website?`<p>${w(t.website)}</p>`:``}
      </div>
      <div>
        <div class="cap">${w(i.billedTo||i.clientLabel)}</div>
        <p class="lead">${w(n.fullName)}</p>
        ${j(e).map(e=>`<p>${w(e)}</p>`).join(``)}
      </div>
      <div>
        <div class="cap">${w(i.invoiceLabel)}</div>
        <div class="kv"><span>#</span><span>${w(r.number)}</span></div>
        <div class="kv"><span>${w(i.dateLabel)}</span><span>${w(r.date)}</span></div>
        <div class="kv"><span>${w(i.dueDateLabel)}</span><span>${w(e.dueText)}</span></div>
      </div>
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>${w(i.description)}</th>
          <th class="center">${w(i.quantity)}</th>
          <th class="right">${w(i.unit)}</th>
          <th class="right">${w(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="pre">${w(e.description)}</td>
          <td class="center">${w(e.quantity)}</td>
          <td class="right nowrap">${o(e.unitPrice)}</td>
          <td class="right nowrap t">${o(e.lineTotal)}</td>
        </tr>`).join(``)}
      </tbody>
    </table>
    <div class="after keep">
      <div class="side">
        ${e.hasPayment?`<div class="block"><div class="cap">${w(i.paymentDetails||i.paymentInfo)}</div>${u.map(([e,t])=>`<div class="kv" style="justify-content:flex-start"><span>${w(e)}</span><span>${w(t)}</span></div>`).join(``)}</div>`:``}
        ${r.notes?`<div class="block pre">${w(r.notes)}</div>`:``}
      </div>
      <div class="totals">
        <div class="kv"><span>${w(i.subtotal)}</span><span>${o(e.subtotal)}</span></div>
        ${e.discount>0?`<div class="kv"><span>${w(i.discount)}</span><span>-${o(e.discount)}</span></div>`:``}
        ${e.taxRate>0?`<div class="kv"><span>${w(i.vat||`VAT`)} ${e.taxRate}%</span><span>${o(e.taxAmount)}</span></div>`:``}
        <div class="kv grand"><span>${w(i.total)}</span><span>${o(e.total)}</span></div>
        ${e.showBalance?`<div class="kv" style="margin-top:8px"><span>${w(i.amountPaid||``)}</span><span>${o(e.paid)}</span></div><div class="kv" style="font-weight:700"><span style="color:#1D2B2E">${w(i.amountDue||i.total)}</span><span>${o(e.due)}</span></div>`:``}
      </div>
    </div>
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
        <div class="line"><b>${w(t.contactPerson)}</b>${w(i.issuedBy)}</div>
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line"><b>${w(n.fullName)}</b>${w(i.receivedBy)}</div>
      </div>
    </div>
    <div class="foot">${w(i.thankYou)}${e.exportNote?`<b>${w(e.exportNote)}</b>`:``}</div>
  `)}var de={classic:se,corporate:le,minimal:ue};function M(e){let t=ae(e);return de[t.templateId](t)}function fe({company:e,template:t,accentColor:n,pdfLabels:r,sample:i}){let a=[{id:`1`,description:i.lines[0]||``,quantity:40,unitPrice:24},{id:`2`,description:i.lines[1]||``,quantity:1,unitPrice:350},{id:`3`,description:i.lines[2]||``,quantity:3,unitPrice:45}],o=e.defaultTaxRate||0;return M({company:e,client:{fullName:i.clientName,address:i.clientAddress,phone:``},invoice:{number:`INV-001`,date:i.date,dueDate:``,items:a,discount:0,taxRate:o,notes:``,status:`unpaid`,lifecycle:`issued`,payments:[]},pdfLabels:r,template:t,accentColor:n})}function pe(e,t){let n=e?.taxRate;return n==null?{rate:W(t),fromClient:!1}:{rate:W(n),fromClient:!0}}var N=`Eksport ne bazë te Ligjit (05-L-037 Neni 33)`;function P(e){return e?.industry!==`services`}function F(e){return P(e)?!e||e.exportNote===void 0||e.exportNote===null?N:String(e.exportNote).trim():``}var I=[`JAN`,`FEB`,`MAR`,`APR`,`MAY`,`JUN`,`JUL`,`AUG`,`SEP`,`OCT`,`NOV`,`DEC`],me={EUR:`€`,USD:`$`,GBP:`£`,CHF:`CHF`,ALL:`L`,MKD:`ден`},he=[`EUR`,`USD`,`GBP`,`CHF`,`ALL`,`MKD`];function L(e){return me[e]||e||`€`}function R(e,t){return`${(Number.isFinite(e)?e:0).toFixed(2)}${L(t)}`}function ge(e){let t=Math.round((Number(e)||0)*100);return t%100==0?String(t/100):(t/100).toFixed(2)}function z(e){let t=parseFloat(String(e??``).replace(`,`,`.`));return Number.isFinite(t)?t:0}function B(){return crypto.randomUUID()}function V(e,t=new Date){let n=e.filter(e=>e.lifecycle!==`draft`),r=n.filter(e=>/^\d{6}-\d+$/.test(e.number||``)).length;if(r>0&&r*2>n.length){let e=`${t.getFullYear()}${String(t.getMonth()+1).padStart(2,`0`)}`,r=n.reduce((t,n)=>{let r=(n.number||``).match(/^(\d{6})-(\d+)$/);return r&&r[1]===e?Math.max(t,Number(r[2])||0):t},0);return`${e}-${String(r+1).padStart(3,`0`)}`}let i=I[t.getMonth()],a=e.filter(e=>(e.number||``).startsWith(`${i}-`)).length;return`${i}-${String(a+1).padStart(3,`0`)}`}function H(e=new Date){let t=e instanceof Date?e:new Date(e);return`${I[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`}function U(e){return Math.round(e*100)/100}function W(e){let t=z(e);if(t<=0)return 0;let n=t<1?t*100:t;return Math.min(Math.round(n*100)/100,100)}function _e(e,t){return Math.round(z(e)/(1+W(t)/100)*1e8)/1e8}function ve(e,t){return U(z(e)*(1+W(t)/100))}function G(e,t,n=0){let r=(e||[]).reduce((e,t)=>e+z(t.quantity)*z(t.unitPrice),0),i=W(n),a=U(r),o=U(Math.max(a-U(z(t)),0)),s=i>0?U(Math.max(r-z(t),0)*(1+i/100)):o;return{subtotal:a,net:o,taxRate:i,taxAmount:U(s-o),total:s}}function K(e){return e?o(e):`unpaid`}function ye(e){return String(e||``).trim().toLowerCase()}function be(e){let t=f(e.date)||f(e.createdAt);return t?t.getFullYear():null}function xe(e){return[...e].sort((e,t)=>{let n=f(e.date)?.getTime()||Date.parse(e.createdAt||``)||0,r=f(t.date)?.getTime()||Date.parse(t.createdAt||``)||0;return n===r?String(e.number||``).localeCompare(String(t.number||``)):n-r})}function Se(e){let t=new Map;for(let n of e){let e=n.client?.fullName?.trim();if(!e)continue;let r=e.toLowerCase(),i=t.get(r);i||(i={client:n.client,unpaid:[],unpaidCount:0,unpaidTotal:0,paidTotal:0},t.set(r,i));let a=l(n);K(n)===`paid`?i.paidTotal+=Number(n.total)||0:K(n)!==`cancelled`&&K(n)!==`draft`&&(i.unpaid.push(n),i.unpaidCount+=1,i.unpaidTotal+=a)}return[...t.values()].filter(e=>e.unpaid.length>0).map(e=>({...e,unpaid:xe(e.unpaid)})).sort((e,t)=>e.client.fullName.localeCompare(t.client.fullName))}function q(e=new Date){let t=e instanceof Date?e:new Date(e);return`${String(t.getDate()).padStart(2,`0`)}.${String(t.getMonth()+1).padStart(2,`0`)}.${t.getFullYear()}`}function Ce(e,t=new Date){return`${String(e||`client`).trim().replace(/[<>:"/\\|?*]/g,``).replace(/\s+/g,` `).slice(0,60)||`client`}-${q(t)}.pdf`}function we(e,t){return{number:V(t),date:H(new Date),dueDate:e.dueDate||``,status:`unpaid`,client:{...e.client},items:(e.items||[]).map(e=>({...e,id:B()})),discount:e.discount,taxRate:e.taxRate||0,pricesIncludeTax:!!e.pricesIncludeTax,notes:e.notes||``,subtotal:e.subtotal,total:e.total}}function J(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function Te(e,t,n){return e.flatMap(e=>{let r=e.items&&e.items.length>0?e.items:[{id:`1`,description:e.number,quantity:1,unitPrice:e.total}],i=r.map((n,r)=>{let i=z(n.quantity),a=z(n.unitPrice);return`<tr>
          <td class="order">${r===0?`<strong>${J(e.number)}</strong><br/><span class="muted">${J(e.date)}</span>`:``}</td>
          <td>${J(n.description)}</td>
          <td class="right">${R(a,t)}</td>
          <td class="center">${J(n.quantity)}</td>
          <td class="right">${R(i*a,t)}</td>
        </tr>`});z(e.discount)>0&&i.push(`<tr>
          <td></td>
          <td>${J(n.discount)}</td>
          <td></td>
          <td></td>
          <td class="right">-${R(z(e.discount),t)}</td>
        </tr>`);let a=G(r,e.discount,e.taxRate);return a.taxAmount>0&&i.push(`<tr>
          <td></td>
          <td>${J(n.vat||`VAT`)} ${a.taxRate}%</td>
          <td></td>
          <td></td>
          <td class="right">${R(a.taxAmount,t)}</td>
        </tr>`),i}).join(``)}function Ee({company:e,client:t,invoices:n,paidTotal:r,issuedDate:i,pdfLabels:a,showPayments:o=!1}){let s=e.currency||`EUR`,c=L(s),u=F(e),d=n.reduce((e,t)=>e+l(t),0),f=Number(r)||0,p=i||q(new Date),m=[e.zipCode,e.state].filter(Boolean).join(` `),h=a.pivaLabel||a.nuiLabel,g=Te(n,s,a);return`<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block { min-width: 0; flex: 1; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p, .client-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; flex-shrink: 0; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 20px; letter-spacing: 1.5px; color: #2C6E7F; }
      .invoice-meta p { margin: 2px 0; }
      .blocks { margin-bottom: 18px; }
      .block-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; vertical-align: top; word-break: break-word; }
      th.center, td.center { text-align: center; width: 8%; }
      th.right, td.right { text-align: right; white-space: nowrap; width: 14%; }
      td.order, th.order { width: 18%; white-space: normal; }
      .muted { color: #6B7A7D; font-size: 10px; }
      .totals { width: 280px; margin-left: auto; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .total-row { font-weight: 700; font-size: 16px; border-top: 2px solid #2C6E7F; margin-top: 4px; padding-top: 8px; color: #1F4E5A; }
      .payment { margin-top: 20px; font-size: 12px; color: #444; }
      .thank-you { text-align: center; margin-top: 28px; font-size: 13px; color: #2C6E7F; font-weight: 600; }
      .export-law { text-align: center; margin-top: 8px; font-size: 13px; font-weight: 700; color: #1D2B2E; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${J(e.companyName)}</h1>
        ${e.streetAddress?`<p>${J(e.streetAddress)}</p>`:``}
        ${m?`<p>${J(m)}</p>`:``}
        ${e.nui?`<p>${J(h)} ${J(e.nui)}</p>`:``}
        ${e.email?`<p>${J(e.email)}</p>`:``}
        ${e.phone?`<p>${J(e.phone)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${J(a.statementTitle||`PREVENTIVI`)}</h2>
        <p>${J(a.dateLabel)}: ${J(p)}</p>
      </div>
    </div>
    <div class="blocks">
      <div class="client-block">
        <div class="block-title">${J(a.billedTo||a.clientLabel)}</div>
        <p><strong>${J(t.fullName)}</strong></p>
        ${t.address?`<p>${J(t.address)}</p>`:``}
        ${t.phone?`<p>${J(t.phone)}</p>`:``}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="order">${J(a.order||a.invoiceLabel)}</th>
          <th>${J(a.patientService||a.description)}</th>
          <th class="right">${J(a.unitPrice||a.unit)} (${c})</th>
          <th class="center">${J(a.qty||a.quantity)}</th>
          <th class="right">${J(a.sum)}</th>
        </tr>
      </thead>
      <tbody>${g}</tbody>
    </table>
    <div class="totals">
      <div><span>${J(a.ordersTotal)}</span><span>${R(d,s)}</span></div>
      ${o?`<div><span>${J(a.paymentsTotal)}</span><span>${R(f,s)}</span></div>`:``}
      <div class="total-row"><span>${J(o?a.balanceDue:a.total)}</span><span>${R(d,s)}</span></div>
    </div>
    ${e.bankName||e.iban?`<div class="payment"><div class="block-title">${J(a.paymentInfo)}</div>${e.bankName?`<p>${J(a.bankName)}: ${J(e.bankName)}</p>`:``}${e.iban?`<p>${J(a.ibanLabel)}: ${J(e.iban)}</p>`:``}</div>`:``}
    <div class="thank-you">${J(a.thankYou)}</div>
    ${u?`<div class="export-law">${J(u)}</div>`:``}
  </body>
  </html>`}function De(e,t){let n=document.createElement(`iframe`);n.style.position=`fixed`,n.style.right=`0`,n.style.bottom=`0`,n.style.width=`0`,n.style.height=`0`,n.style.border=`0`,document.body.appendChild(n);let r=n.contentDocument;if(!r)throw document.body.removeChild(n),Error(`Could not open print preview.`);r.open(),r.write(e),r.close();let i=r.querySelector(`title`);if(i)i.textContent=t;else{let e=r.createElement(`title`);e.textContent=t,r.head.appendChild(e)}setTimeout(()=>{n.contentWindow?.focus(),n.contentWindow?.print(),setTimeout(()=>document.body.removeChild(n),1e3)},250)}function Y(e,t=`all`,n=new Date){return`${e}-${t===`paid`?`paguara`:t===`unpaid`?`papaguara`:`lista`}-${q(n)}.pdf`}function Oe(e=`all`,t=new Date){return Y(`faturat`,e,t)}function ke(e=`paid`,t=new Date){return Y(`detyrimet`,e,t)}function Ae({company:e,obligations:t,issuedDate:n,pdfLabels:r}){let i=e.currency||`EUR`,a=n||q(new Date),o=[e.zipCode,e.state].filter(Boolean).join(` `),s=r.pivaLabel||r.nuiLabel,c=t.reduce((e,t)=>e+(Number(t.amount)||0),0),l=t.map(e=>`<tr>
        <td>${J(e.vendor)}</td>
        <td>${J(e.notes||e.description||``)}</td>
        <td>${J(e.date||``)}</td>
        <td class="center">${e.proofName||e.proofData||e.proofUri?J(r.proofYes||`Yes`):J(r.proofNo||`—`)}</td>
        <td class="right">${R(Number(e.amount)||0,i)}</td>
      </tr>`).join(``);return`<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      th.center, td.center { text-align: center; }
      .totals { width: 240px; margin-left: auto; font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; border-top: 2px solid #2C6E7F; padding-top: 8px; color: #1F4E5A; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${J(e.companyName)}</h1>
        ${e.streetAddress?`<p>${J(e.streetAddress)}</p>`:``}
        ${o?`<p>${J(o)}</p>`:``}
        ${e.nui?`<p>${J(s)} ${J(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${J(r.paidObligationsTitle||`Paid`)}</h2>
        <p>${J(r.dateLabel)}: ${J(a)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${J(r.vendor||`Vendor`)}</th>
          <th>${J(r.description)}</th>
          <th>${J(r.dateLabel)}</th>
          <th class="center">${J(r.proofLabel||`Proof`)}</th>
          <th class="right">${J(r.sum)}</th>
        </tr>
      </thead>
      <tbody>${l}</tbody>
    </table>
    <div class="totals"><span>${J(r.total)}</span><span>${R(c,i)}</span></div>
  </body>
  </html>`}function je({company:e,invoices:t,issuedDate:n,pdfLabels:r}){let i=e.currency||`EUR`,a=n||q(new Date),s=[e.zipCode,e.state].filter(Boolean).join(` `),c=r.pivaLabel||r.nuiLabel,u=t.reduce((e,t)=>t.status===`cancelled`||t.lifecycle===`cancelled`?e:e+l(t),0),d=t.map(e=>{let t=o(e),n=t===`paid`?r.statusPaid||`Paid`:t===`partial`?r.statusPartial||`Partial`:t===`cancelled`?r.statusCancelled||`Cancelled`:t===`draft`?r.statusDraft||`Draft`:r.statusUnpaid||`Unpaid`,a=Number(e.total)||0;return`<tr>
        <td>${J(e.number||``)}</td>
        <td>${J(e.client?.fullName||``)}</td>
        <td>${J(e.date||``)}</td>
        <td>${J(n)}</td>
        <td class="right">${R(a,e.currency||i)}</td>
      </tr>`}).join(``);return`<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      .totals { width: 240px; margin-left: auto; font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; border-top: 2px solid #2C6E7F; padding-top: 8px; color: #1F4E5A; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${J(e.companyName)}</h1>
        ${e.streetAddress?`<p>${J(e.streetAddress)}</p>`:``}
        ${s?`<p>${J(s)}</p>`:``}
        ${e.nui?`<p>${J(c)} ${J(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${J(r.listTitle||r.statementTitle||`List`)}</h2>
        <p>${J(r.dateLabel)}: ${J(a)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${J(r.invoiceLabel)}</th>
          <th>${J(r.clientLabel)}</th>
          <th>${J(r.dateLabel)}</th>
          <th>${J(r.statusLabel||``)}</th>
          <th class="right">${J(r.sum)}</th>
        </tr>
      </thead>
      <tbody>${d}</tbody>
    </table>
    <div class="totals"><span>${J(r.total)}</span><span>${R(u,i)}</span></div>
  </body>
  </html>`}function Me(e=new Date){return`pasqyra-${q(e)}.pdf`}function Ne({company:e,report:t,periodText:n,issuedDate:r,pdfLabels:i,notes:a=[]}){let o=t.currency||e.currency||`EUR`,s=r||q(new Date),c=[e.zipCode,e.state].filter(Boolean).join(` `),l=i.pivaLabel||i.nuiLabel,u=[[i.invoiced,t.invoiced],[i.received,t.paymentsReceived],[i.obligationsRecorded,t.obligationsRecorded],[i.paidOut,t.paymentsMade],[i.receivables,t.receivables],[i.payables,t.payables],[i.netPayments,t.netPayments]].map(([e,t])=>`<tr><td>${J(String(e))}</td><td class="right">${R(Number(t)||0,o)}</td></tr>`).join(``),d=(t.customers||[]).map(e=>`<tr><td>${J(e.client?.fullName||``)}</td><td class="right">${R(e.amount,o)}</td></tr>`).join(``),f=(t.overduePayables||[]).map(e=>`<tr><td>${J(e.vendor||``)}</td><td>${J(e.dueDate||``)}</td><td class="right">${R(e.amountDueAsOf||0,o)}</td></tr>`).join(``),p=a.length?`<div class="notes"><div class="block-title">${J(i.limitationTitle||``)}</div>${a.map(e=>`<p>${J(e)}</p>`).join(``)}</div>`:``;return`<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      h3 { margin: 18px 0 8px; font-size: 13px; color: #1F4E5A; text-transform: uppercase; letter-spacing: 0.04em; }
      .notes { margin-top: 16px; padding: 10px 12px; background: #F8E8E4; border-radius: 8px; }
      .notes p { margin: 4px 0; color: #7A3B2E; }
      .block-title { font-weight: 700; margin-bottom: 6px; }
      .hint { color: #6B7A7D; margin: 0 0 12px; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${J(e.companyName)}</h1>
        ${e.streetAddress?`<p>${J(e.streetAddress)}</p>`:``}
        ${c?`<p>${J(c)}</p>`:``}
        ${e.nui?`<p>${J(l)} ${J(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${J(i.pdfTitle||i.listTitle||`Overview`)}</h2>
        <p>${J(i.period||``)}: ${J(n)}</p>
        <p>${J(i.asOf||``)}: ${J(t.period?.endIso||s)}</p>
        <p>${J(i.dateLabel)}: ${J(s)}</p>
        <p>${J(o)}</p>
      </div>
    </div>
    <p class="hint">${J(i.netHint||``)}</p>
    <table>
      <thead><tr><th>${J(i.summary||``)}</th><th class="right">${J(i.sum)}</th></tr></thead>
      <tbody>${u}</tbody>
    </table>
    <h3>${J(i.customers||``)}</h3>
    <table>
      <thead><tr><th>${J(i.clientLabel)}</th><th class="right">${J(i.sum)}</th></tr></thead>
      <tbody>${d||`<tr><td colspan="2">${J(i.empty||``)}</td></tr>`}</tbody>
    </table>
    <h3>${J(i.overdue||``)}</h3>
    <table>
      <thead><tr><th>${J(i.vendor||``)}</th><th>${J(i.dateLabel)}</th><th class="right">${J(i.sum)}</th></tr></thead>
      <tbody>${f||`<tr><td colspan="3">${J(i.empty||``)}</td></tr>`}</tbody>
    </table>
    ${p}
  </body>
  </html>`}var X={companyName:[`Kompania juaj (shembull)`,`Your company (sample)`,`La tua azienda (esempio)`],contactPerson:[`Emri juaj (shembull)`,`Your name (sample)`,`Il tuo nome (esempio)`],nui:[`000000000`],streetAddress:[`Rruga shembull, nr. 1`,`Example street, no. 1`,`Via esempio, n. 1`],state:[`Kosovë`,`Kosovo`],zipCode:[`10000`],email:[`email@shembull.com`,`email@example.com`,`email@esempio.com`],phone:[`+383 00 000 000`]},Pe={companyName:`profile.phCompanyName`,contactPerson:`profile.phContactPerson`,nui:`profile.phNui`,streetAddress:`profile.phStreetAddress`,state:`profile.phState`,zipCode:`profile.phZipCode`,email:`profile.phEmail`,phone:`profile.phPhone`},Z=Object.keys(X);function Q(e,t){let n=String(t??``).trim();return!n||X[e].includes(n)}function Fe(e,t){return Q(e,t)?``:String(t??``)}function Ie(e){let t={...e};for(let n of Z)Q(n,e[n])&&(t[n]=``);return t.currency=e.currency?.trim()||`EUR`,(e.exportNote===void 0||e.exportNote===null)&&(t.exportNote=N),t}function $(e,t){let n={...e};for(let r of Z)Q(r,e[r])&&(n[r]=t(Pe[r]));return n.currency=e.currency?.trim()||t(`profile.phCurrency`),n.bankName=e.bankName||``,n.iban=e.iban||``,n.exportNote=e.exportNote===void 0||e.exportNote===null?N:e.exportNote,n}function Le(e,t,n){let r=$(t,n),i=e?.companySnapshot;return i?{...i,vatNumber:i.vatNumber??r.vatNumber,swift:i.swift??r.swift,website:i.website??r.website,industry:i.industry??r.industry,logoData:r.logoData,signatureData:r.signatureData,stampData:r.stampData,invoiceTemplate:r.invoiceTemplate,accentColor:r.accentColor}:r}export{ee as $,Me as A,C as B,ve as C,_e as D,be as E,te as F,v as G,i as H,b as I,r as J,c as K,x as L,Ce as M,z as N,W as O,P,g as Q,M as R,V as S,K as T,m as U,S as V,a as W,o as X,f as Y,l as Z,ge as _,Ie as a,q as b,je as c,Ee as d,y as et,ye as f,we as g,De as h,$ as i,pe as j,ke as k,Ne as l,G as m,Fe as n,s as nt,he as o,Se as p,h as q,Q as r,t as rt,N as s,Le as t,_ as tt,Ae as u,H as v,Oe as w,B as x,R as y,fe as z};