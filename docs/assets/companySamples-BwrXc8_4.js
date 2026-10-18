import{w as e}from"./index-lDCGIQ7e.js";var t=e(`credit-card`,[[`rect`,{width:`20`,height:`14`,x:`2`,y:`5`,rx:`2`,key:`ynyp8z`}],[`line`,{x1:`2`,x2:`22`,y1:`10`,y2:`10`,key:`1b3vmo`}]]),n=e(`download`,[[`path`,{d:`M12 15V3`,key:`m9g1x1`}],[`path`,{d:`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`,key:`ih7n3h`}],[`path`,{d:`m7 10 5 5 5-5`,key:`brsn70`}]]),r=e(`external-link`,[[`path`,{d:`M15 3h6v6`,key:`1q9fwt`}],[`path`,{d:`M10 14 21 3`,key:`gplh6r`}],[`path`,{d:`M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`,key:`a6xqqp`}]]);function i(e){let t=typeof e==`number`?e:parseFloat(String(e??``).replace(`,`,`.`));return Number.isFinite(t)?Math.round(t*100):0}function a(e){return i(e)/100}function o(e){return(e||[]).filter(e=>!e.voidedAt)}function s(e){let t=i(e?.total??e?.amount??0),n=o(e?.payments).reduce((e,t)=>e+i(t.amount),0),r=Math.max(t-n,0);return{total:t/100,amountPaid:n/100,amountDue:r/100}}function c(e){if(e?.lifecycle===`cancelled`||e?.status===`cancelled`)return`cancelled`;if(e?.lifecycle===`draft`)return`draft`;let t=s(e),n=i(e?.total??e?.amount??0),r=i(t.amountPaid);return e?.status===`paid`&&r===0||n>0&&t.amountDue===0?`paid`:r>0?`partial`:`unpaid`}function l(e){let t=c(e);return t===`draft`?`unpaid`:t}function u(e){return e?.sent===!1?!1:e?.sentAt||e?.sent===!0?!0:e?.lifecycle!==`draft`}function d(e){let t=c(e);return t===`cancelled`||t===`draft`||t===`paid`?0:s(e).amountDue}function f(e){return c(e)!==`cancelled`&&c(e)!==`draft`}var p=[`JAN`,`FEB`,`MAR`,`APR`,`MAY`,`JUN`,`JUL`,`AUG`,`SEP`,`OCT`,`NOV`,`DEC`];function m(e){if(!e)return null;let t=String(e).trim(),n=t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);if(n)return new Date(Number(n[1]),Number(n[2])-1,Number(n[3]));let r=t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(r){let e=Number(r[2])>12&&Number(r[1])<=12;return new Date(Number(r[3]),Number(r[e?1:2])-1,Number(r[e?2:1]))}let i=t.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i);if(i){let e=p.indexOf(i[1].toUpperCase());if(e>=0)return new Date(Number(i[3]),e,Number(i[2]))}let a=Date.parse(t);return Number.isFinite(a)?new Date(a):null}function h(e){return new Date(e.getFullYear(),e.getMonth(),e.getDate())}function g(e,t=new Date){let n=c(e);if(n===`paid`||n===`cancelled`||n===`draft`||d(e)<=0)return 0;let r=m(e?.dueDate);if(!r)return 0;let i=Math.floor((h(t).getTime()-h(r).getTime())/864e5);return i>0?i:0}function _(e,t=new Date){return g(e,t)>0}function v(e,t,n){let r=e?.dueDate||t.onReceipt,i=d(e).toFixed(2);return[t.hello,t.body.replace(`{number}`,e?.number||``).replace(`{due}`,r).replace(`{amount}`,i).replace(`{days}`,String(n)),t.thanks].join(`

`)}function y(e,t){let n=new Map;for(let r of e){if(!f(r))continue;let e=r.currency||`EUR`;n.set(e,a((n.get(e)||0)+t(r)))}return[...n.entries()].map(([e,t])=>({currency:e,amount:t}))}function b(e,t){return e.length?e.map(e=>t(e.amount,e.currency)).join(` · `):t(0,`EUR`)}async function ee(e,t){let n=c(e);if(!(n===`cancelled`||n===`draft`)){if(n===`paid`){for(let n of o(e.payments))await t.voidPayment(e.id,n.id,`unpaid`);t.setStatus&&await t.setStatus(`unpaid`);return}if(t.payload.amount>0){await t.addPayment(e.id,t.payload);return}t.setStatus&&await t.setStatus(`paid`)}}function te(e=new Date){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`}var ne=[`managingDirector`,`administrationDirector`,`director`,`owner`,`authorizedPerson`],re={managingDirector:`roleManagingDirector`,administrationDirector:`roleAdministrationDirector`,director:`roleDirector`,owner:`roleOwner`,authorizedPerson:`roleAuthorizedPerson`},ie=`company`;function x(e){return Array.isArray(e?.signers)?e.signers:e?.signatureData?[{id:ie,name:e.contactPerson||``,signatureData:e.signatureData}]:[]}function S(e){return x(e).filter(e=>!e.removed)}function C(e){let t=S(e);return t.find(t=>t.id===e?.defaultSignerId)||t[0]||null}function ae(e,t){return(t?x(e).find(e=>e.id===t):void 0)||C(e)}function oe(e,t){return(t?S(e).find(e=>e.userId===t&&e.signatureData):void 0)||C(e)}function se(e){return re[String(e||``)]||``}function ce(e,t){let n=se(e);return n?t[n]||``:String(e||``).trim()}var le=[`classic`,`corporate`,`minimal`],w={classic:`#2C6E7F`,corporate:`#2E75B6`,minimal:`#1D2B2E`},ue=[`#2C6E7F`,`#2E75B6`,`#1D2B2E`,`#6B4FA0`,`#B4532A`,`#2E7D32`,`#A67C00`];function T(e){return le.includes(e)?e:`classic`}function de(e){return/^#[0-9a-fA-F]{6}$/.test(String(e||``))}function fe(e,t){return de(t)?t:w[e]}function E(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`)}function D(e){let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]}function O(e,t){return`#${D(e).map(e=>Math.round(e+(255-e)*t).toString(16).padStart(2,`0`)).join(``)}`}function pe(e,t){return`#${D(e).map(e=>Math.round(e*(1-t)).toString(16).padStart(2,`0`)).join(``)}`}function me(e){let[t,n,r]=D(e);return(t*299+n*587+r*114)/1e3>165?`#1D2B2E`:`#FFFFFF`}function k(e){return(Number.isFinite(e)?e:0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,`,`)}function A(e){let t=String(e||``);return/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(t)?t:``}function he({company:e,client:t,invoice:n,pdfLabels:r,template:i,accentColor:a}){let o=i||T(e.invoiceTemplate),s=fe(o,a??e.accentColor),l=n.items||[],{subtotal:u,total:f,taxRate:p,taxAmount:m}=q(l,n.discount,n.taxRate),h=d(n),g=h===0&&c(n)!==`draft`?f:f-h,_=z(n.currency||e.currency),v=e=>`${k(e)} ${_}`,y=[e.state,e.zipCode].map(e=>String(e||``).trim()).filter(Boolean).join(`, `),b=ae(e,n.signerId);return{templateId:o,accent:s,accentInk:me(s),L:r,company:e,client:t,invoice:n,symbol:_,money:v,cityLine:y,rows:l.map((e,t)=>({index:t+1,description:e.description,quantity:e.quantity,unitPrice:V(e.unitPrice),lineTotal:V(e.quantity)*V(e.unitPrice)})),subtotal:u,discount:V(n.discount),taxRate:p,taxAmount:m,total:f,paid:g,due:h,showBalance:h>0&&h<f,date:Ce(n.date),dueText:Ce(n.dueDate)||r.onReceipt||``,exportNote:L(e),logo:A(e.logoData),signature:n.unsigned?``:A(b?.signatureData),stamp:n.unsigned?``:A(e.stampData),signerName:b?.name||e.contactPerson||``,signerRole:b?ce(b.role,r):``,hasPayment:!!(e.bankName||e.iban||e.accountNumber||e.swift)}}function ge(e){return`
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
    /* No top or bottom page margin leaves Chrome no room for its headers and footers (date, title,
       address, page numbers), so "Save as PDF" starts with them off. The sheet's empty header and
       footer rows repeat on every printed page and stand in for that margin. */
    @page { size: A4; margin: 0 12mm; }
    .sheet { width: 100%; }
    .sheet > * > tr > td { padding: 0; }
    .sheet > tbody > tr { break-inside: auto; page-break-inside: auto; }
    .sheet-gap { height: 12mm; }
    @media screen { .sheet > thead, .sheet > tfoot { display: none; } }
    @media print { .page { padding: 0; } }
  `}function j(e,t,n,r){return`<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="utf-8" />
<title>${E(e.invoice.number)}</title>
<style>${ge(t)}${n}</style>
</head>
<body><table class="sheet"><thead><tr><td class="sheet-gap"></td></tr></thead><tfoot><tr><td class="sheet-gap"></td></tr></tfoot><tbody><tr><td><div class="page">${r}</div></td></tr></tbody></table></body>
</html>`}function _e(e){let{company:t,L:n}=e;return[[t.bankName?[n.bankName,t.bankName]:null],[t.accountNumber?[n.accountLabel||`Account No.`,t.accountNumber]:null],[t.iban?[n.ibanLabel,t.iban]:null,t.swift?[n.swiftLabel||`SWIFT (BIC)`,t.swift]:null]].map(e=>e.filter(Boolean)).filter(e=>e.length).map(e=>`<div class="pl">${e.map(([e,t])=>`<span><span class="pk">${E(e)}:</span> ${E(t)}</span>`).join(``)}</div>`).join(``)}var ve=`.pl { display: flex; flex-wrap: wrap; column-gap: 22px; }`;function ye(e){let{company:t,L:n}=e;return[[n.beneficiary||`Beneficiary`,t.companyName],t.bankName?[n.bankName,t.bankName]:null,t.accountNumber?[n.accountLabel||`Account No.`,t.accountNumber]:null,t.iban?[n.ibanLabel,t.iban]:null,t.swift?[n.swiftLabel||`SWIFT (BIC)`,t.swift]:null].filter(Boolean)}var be=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5"/><path d="M4 9.5h16"/><path d="M6 10v7.5M10 10v7.5M14 10v7.5M18 10v7.5"/><path d="M3.5 20h17"/></svg>`;function xe(e){let{client:t,L:n}=e;return[t.address,t.businessId?`${n.nuiLabel}: ${t.businessId}`:``,t.fiscalNumber?`${n.fiscalLabel||`Fiscal No`}: ${t.fiscalNumber}`:``,t.vatNumber?`${n.vatLabel||`VAT`}: ${t.vatNumber}`:``,t.phone,t.email].filter(e=>String(e||``).trim())}function Se(e){let{client:t,L:n}=e;return[[n.addressLabel,t.address],[n.nuiLabel,t.businessId],[n.fiscalLabel||`Fiscal No`,t.fiscalNumber],[n.vatLabel||`VAT`,t.vatNumber],[``,t.phone],[``,t.email]].filter(([,e])=>String(e||``).trim())}function Ce(e){let t=String(e||``).trim(),n=t?m(t):null;if(!n||Number.isNaN(n.getTime()))return t;let r=e=>String(e).padStart(2,`0`);return`${r(n.getDate())}.${r(n.getMonth()+1)}.${n.getFullYear()}`}function we(e){let{company:t,L:n}=e,r=(e,t)=>{let n=String(t||``).trim();return n?[[e,n]]:[]};return{address:[t.streetAddress,e.cityLine].map(e=>String(e||``).trim()).filter(Boolean),ids:[...r(n.nuiLabel||`NUI`,t.nui),...r(n.vatLabel||`VAT`,t.vatNumber)],contact:[...r(n.phoneLabel||`Phone`,t.phone),...r(n.emailLabel||`Email`,t.email),...r(n.websiteLabel||`Website`,t.website)]}}function Te(e){let{address:t,ids:n,contact:r}=we(e),i=e=>`<span class="ik">${E(e)}:</span>`;return[...t.length?[i(e.L.addressLabel||`Address`),...t.map(E)]:[],...[...n,...r].map(([e,t])=>`${i(e)} ${E(t)}`)].map(e=>`<p>${e}</p>`).join(``)}function M(e){let{invoice:t,L:n}=e,r=[[n.contractName||`Contract name`,t.contractName],[n.contractNumber||`Contract number`,t.contractNumber]].map(([e,t])=>[e,String(t||``).trim()]).filter(([,e])=>e);return r.length?`<div class="contract keep">${r.map(([e,t])=>`<div><span class="ck">${E(e)}:</span> <span class="cv">${E(t)}</span></div>`).join(``)}</div>`:``}function N(e){return`
    .contract { display: flex; margin: 0 0 12px; padding: 5px 10px; background: ${O(e,.94)}; border-bottom: 1px solid ${O(e,.7)}; font-size: 11px; line-height: 1.35; }
    .contract > div { flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; }
    .contract > div + div { margin-left: 12px; padding-left: 12px; border-left: 1px solid ${O(e,.6)}; }
    .contract .ck { color: #6B7A7D; }
    .contract .cv { font-weight: 600; color: #1D2B2E; }
  `}function Ee(e){let{company:t,client:n,invoice:r,L:i,accent:a,money:o}=e,s=pe(a,.28);return j(e,`-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`,`
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 3px solid ${a}; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
    .logo { height: 64px; max-width: 150px; object-fit: contain; flex-shrink: 0; }
    .brand h1 { margin: 0 0 6px; font-size: 20px; color: ${s}; }
    .brand p, .client p { margin: 2px 0; color: #444; }
    .brand .ik { font-weight: 600; color: #1D2B2E; }
    .meta { text-align: right; flex-shrink: 0; }
    .meta h2 { margin: 0 0 8px; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; color: ${a}; }
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
    ${ve}
    .payment .pl { margin: 2px 0; }
    .thanks { text-align: center; margin-top: 30px; font-size: 13px; color: ${a}; font-weight: 600; }
    .law { text-align: center; margin-top: 8px; font-size: 13px; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 48px; }
    .sign { width: 38%; text-align: center; font-size: 12px; color: #555; }
    .sign .ink { height: 46px; display: flex; align-items: flex-end; justify-content: center; }
    .sign .ink img { max-height: 46px; max-width: 160px; }
    .sign .line { border-top: 1px solid #999; padding-top: 6px; }
    .sign .role { display: block; font-size: 10.5px; color: #888; }
    .stamp { width: 20%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
    ${N(a)}
  `,`
    <div class="top">
      <div class="brand">
        ${e.logo?`<img class="logo" src="${e.logo}" alt="" />`:``}
        <div>
          <h1>${E(t.companyName)}</h1>
          ${Te(e)}
        </div>
      </div>
      <div class="meta">
        <h2>${E(i.invoiceTitle||`INVOICE`)}</h2>
        <p>${E(i.invoiceLabel)}: <strong>${E(r.number)}</strong></p>
        <p>${E(i.dateLabel)}: ${E(e.date)}</p>
        <p>${E(i.dueDateLabel)}: ${E(e.dueText)}</p>
      </div>
    </div>
    <div class="client">
      <div class="label">${E(i.clientLabel)}</div>
      <p><strong>${E(i.fullNameLabel)}:</strong> ${E(n.fullName)}</p>
      ${n.address?`<p><strong>${E(i.addressLabel)}:</strong> ${E(n.address)}</p>`:``}
      ${n.businessId?`<p><strong>${E(i.nuiLabel)}:</strong> ${E(n.businessId)}</p>`:``}
      ${n.fiscalNumber?`<p><strong>${E(i.fiscalLabel||`Fiscal No`)}:</strong> ${E(n.fiscalNumber)}</p>`:``}
      ${n.vatNumber?`<p><strong>${E(i.vatLabel||`VAT`)}:</strong> ${E(n.vatNumber)}</p>`:``}
      ${n.phone?`<p><strong>${E(i.phoneLabel)}:</strong> ${E(n.phone)}</p>`:``}
      ${n.email?`<p><strong>${E(i.emailLabel||`Email`)}:</strong> ${E(n.email)}</p>`:``}
    </div>
    ${M(e)}
    <table class="items">
      <thead>
        <tr>
          <th>${E(i.description)}</th>
          <th class="center">${E(i.quantity)}</th>
          <th class="right">${E(i.unit)} (${E(e.symbol)})</th>
          <th class="right">${E(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="pre">${E(e.description)}</td>
          <td class="center">${E(e.quantity)}</td>
          <td class="right nowrap">${o(e.unitPrice)}</td>
          <td class="right nowrap">${o(e.lineTotal)}</td>
        </tr>`).join(``)}
      </tbody>
    </table>
    <div class="totals keep">
      <div><span>${E(i.subtotal)}</span><span>${o(e.subtotal)}</span></div>
      ${e.discount>0?`<div><span>${E(i.discount)}</span><span>-${o(e.discount)}</span></div>`:``}
      ${e.taxRate>0?`<div><span>${E(i.vat||`VAT`)} ${e.taxRate}%</span><span>${o(e.taxAmount)}</span></div>`:``}
      <div class="grand"><span>${E(i.total)}</span><span>${o(e.total)}</span></div>
      ${e.showBalance?`<div><span>${E(i.amountPaid||``)}</span><span>${o(e.paid)}</span></div><div class="grand"><span>${E(i.amountDue||i.total)}</span><span>${o(e.due)}</span></div>`:``}
    </div>
    ${r.notes?`<div class="notes pre">${E(r.notes)}</div>`:``}
    ${e.hasPayment?`<div class="payment keep"><div class="label">${E(i.paymentInfo)}</div>${_e(e)}</div>`:``}
    <div class="thanks">${E(i.thankYou)}</div>
    ${e.exportNote?`<div class="law">${E(e.exportNote)}</div>`:``}
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
        <div class="line">${E(e.signerName)}${P(e)||`<br/>`}${E(i.issuedBy)}</div>
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line">${E(n.fullName)}${P(e,!0)||`<br/>`}${E(i.receivedBy)}</div>
      </div>
    </div>
  `)}function P(e,t=!1){return e.signerRole?`<span class="role">${t?`&nbsp;`:E(e.signerRole)}</span>`:``}var De=6;function Oe(e){let{company:t,client:n,invoice:r,L:i,accent:a,symbol:o}=e,s=O(a,.86),c=O(a,.68),l=O(a,.52),u=O(a,.3),d=e=>`<span class="cur">${E(o)}</span><span>${k(e)}</span>`,f=Math.max(De-e.rows.length,0),p=`
    .band { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: ${a}; color: ${e.accentInk}; padding: 14px 32px; }
    .band-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .band-logo { height: 44px; max-width: 120px; object-fit: contain; background: #fff; border-radius: 4px; padding: 4px; flex-shrink: 0; }
    .band h1 { margin: 0; font-size: 25px; font-weight: 700; letter-spacing: 0.2px; }
    .band-title { font-size: 28px; font-weight: 400; white-space: nowrap; }
    .sub { display: flex; gap: 24px; justify-content: space-between; background: ${c}; padding: 14px 32px 14px 64px; font-size: 10.5px; font-weight: 700; }
    .sub td { padding: 1px 0; vertical-align: top; }
    .sub td.k { text-align: right; padding-right: 28px; white-space: nowrap; }
    .sub .ln + .ln { margin-top: 3px; }
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
    .pay { flex: 1; margin-top: 14px; border: 1px solid ${u}; border-radius: 6px; overflow: hidden; font-size: 11px; }
    .pay-head { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1.5px solid ${a}; color: ${a}; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
    .pay-head svg { width: 17px; height: 17px; flex-shrink: 0; }
    .pay table { width: 100%; }
    .pay td { padding: 4px 12px; vertical-align: top; }
    .pay tr:nth-child(even) td { background: ${s}; }
    .pay td.pk { width: 1%; padding-right: 40px; color: #5F6F73; white-space: nowrap; }
    .pay td.pv { font-weight: 700; color: #1D2B2E; letter-spacing: 0.2px; word-break: break-all; }
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
    .sign .role { display: block; margin-top: 4px; color: #555; }
    .stamp { width: 24%; text-align: center; }
    .stamp img { max-height: 110px; max-width: 120px; }
    .foot { margin-top: 22px; text-align: center; font-size: 11px; color: #555; }
    .foot b { display: block; color: #1D2B2E; margin-top: 4px; }
    ${N(a)}
    .parties + .contract { margin-top: -8px; }
  `,m=we(e);return j(e,`Calibri, Carlito, "Segoe UI", -apple-system, Helvetica, Arial, sans-serif`,p,`
    <div class="band">
      <div class="band-brand">
        ${e.logo?`<img class="band-logo" src="${e.logo}" alt="" />`:``}
        <h1>${E(t.companyName)}</h1>
      </div>
      <div class="band-title">${E(i.invoiceTitle||`Invoice`)}</div>
    </div>
    <div class="sub">
      <div>
        ${m.address.length?[`${E(i.addressLabel||`Address`)}:`,...m.address.map(E)].map(e=>`<div class="ln">${e}</div>`).join(``):``}
      </div>
      <table>
        ${m.ids.map(([e,t])=>`<tr><td class="k">${E(e)}:</td><td>${E(t)}</td></tr>`).join(``)}
      </table>
      <div>
        ${m.contact.map(([e,t])=>`<div class="ln">${E(e)}: ${E(t)}</div>`).join(``)}
      </div>
    </div>
    <div class="parties">
      <table>
        <tr><td class="k">${E(i.customer||i.clientLabel)}:</td><td>${E(n.fullName)}</td></tr>
        ${Se(e).map(([e,t])=>`<tr><td class="k">${e?`${E(e)}:`:``}</td><td>${E(t)}</td></tr>`).join(``)}
      </table>
      <table>
        <tr><td class="k">${E(i.invoiceLabel)} #:</td><td>${E(r.number)}</td></tr>
        <tr><td class="k">${E(i.dateLabel)}:</td><td>${E(e.date)}</td></tr>
        <tr><td class="k">${E(i.dueDateLabel)}:</td><td>${E(e.dueText)}</td></tr>
      </table>
    </div>
    ${M(e)}
    <table class="items${f?``:` dense`}">
      <thead>
        <tr>
          <th class="n">#</th>
          <th>${E(i.description)}</th>
          <th class="q">${E(i.quantity)}</th>
          <th class="u">${E(i.unit)}</th>
          <th class="t">${E(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="n">${e.index}</td>
          <td class="pre">${E(e.description)}</td>
          <td class="q">${E(e.quantity)}</td>
          <td class="u"><div class="amount">${d(e.unitPrice)}</div></td>
          <td class="t sum"><div class="amount">${d(e.lineTotal)}</div></td>
        </tr>`).join(``)}
        ${`<tr><td class="n"></td><td></td><td class="q"></td><td class="u"></td><td class="t sum"></td></tr>`.repeat(f)}
      </tbody>
    </table>
    <div class="bottom keep">
      ${e.hasPayment?`<div class="pay">
              <div class="pay-head">${be}<span>${E(i.bankDetails||i.paymentDetails||i.paymentInfo)}</span></div>
              <table>${ye(e).map(([e,t])=>`<tr><td class="pk">${E(e)}</td><td class="pv">${E(t)}</td></tr>`).join(``)}</table>
            </div>`:`<div style="flex:1"></div>`}
      <table class="totals">
        <tr><td class="k">${E(i.subtotal)}</td><td class="v"><div class="amount">${d(e.subtotal)}</div></td></tr>
        <tr><td class="k">${E(i.discount)}</td><td class="v"><div class="amount">${e.discount>0?d(e.discount):`<span class="cur">${E(o)}</span><span>-</span>`}</div></td></tr>
        <tr><td class="k">${E(i.vat||`VAT`)} %</td><td class="v"><div class="amount"><span></span><span>${e.taxRate.toFixed(2)}%</span></div></td></tr>
        <tr><td class="k">${E(i.vat||`VAT`)}</td><td class="v"><div class="amount">${e.taxAmount>0?d(e.taxAmount):`<span class="cur">${E(o)}</span><span>-</span>`}</div></td></tr>
        <tr class="grand"><td class="k">${E(String(i.total||``).toUpperCase())}</td><td><div class="amount">${d(e.total)}</div></td></tr>
        ${e.showBalance?`<tr><td class="k">${E(i.amountPaid||``)}</td><td class="v"><div class="amount">${d(e.paid)}</div></td></tr>
               <tr class="grand"><td class="k">${E(i.amountDue||i.total)}</td><td><div class="amount">${d(e.due)}</div></td></tr>`:``}
      </table>
    </div>
    ${r.notes?`<div class="notes pre">${E(r.notes)}</div>`:``}
    <div class="signs keep">
      <div class="sign">
        <b>${E(i.signature||`Signature`)} (${E(t.companyName)}):</b>
        <div class="ink"><span>${E(e.signerName)}</span>${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
        ${P(e)}
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <b>${E(i.signature||`Signature`)}:</b>
        <div class="ink"></div>
        ${P(e,!0)}
      </div>
    </div>
    ${e.exportNote?`<div class="foot"><b>${E(e.exportNote)}</b></div>`:``}
  `)}function ke(e){let{company:t,client:n,invoice:r,L:i,accent:a,money:o}=e,s=`#E3E7E8`,c=`#6B7A7D`;return j(e,`"Helvetica Neue", Helvetica, "Segoe UI", -apple-system, Arial, sans-serif`,`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .logo { height: 56px; max-width: 180px; object-fit: contain; }
    .name { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 30px; font-weight: 300; letter-spacing: 3px; text-transform: uppercase; color: ${a}; }
    .title p { margin-top: 4px; font-size: 13px; color: ${c}; }
    .rule { height: 2px; background: ${a}; margin: 22px 0 24px; width: 48px; }
    .cols { display: flex; gap: 28px; margin-bottom: 30px; }
    .cols > div { flex: 1; min-width: 0; }
    .cols > div:last-child { flex: 0 0 26%; }
    .cap { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; color: ${c}; margin-bottom: 8px; }
    .cols p { margin: 2px 0; color: #444; }
    .cols p.lead { font-weight: 700; font-size: 13px; color: #1D2B2E; }
    .cols .ik { color: ${c}; }
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
    ${ve}
    .side .pl { padding: 2px 0; }
    .side .pk { color: ${c}; }
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
    .sign .role { display: block; }
    .stamp { width: 22%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
    .foot { margin-top: 28px; padding-top: 14px; border-top: 1px solid ${s}; text-align: center; font-size: 11px; color: ${c}; }
    .foot b { display: block; margin-top: 4px; color: #1D2B2E; }
    ${N(a)}
    .cols + .contract { margin-top: -14px; margin-bottom: 18px; }
  `,`
    <div class="head">
      ${e.logo?`<img class="logo" src="${e.logo}" alt="" />`:`<div class="name">${E(t.companyName)}</div>`}
      <div class="title">
        <h2>${E(i.invoiceTitle||`INVOICE`)}</h2>
        <p>${E(r.number)}</p>
      </div>
    </div>
    <div class="rule"></div>
    <div class="cols">
      <div>
        <div class="cap">${E(i.issuedBy)}</div>
        <p class="lead">${E(t.companyName)}</p>
        ${Te(e)}
      </div>
      <div>
        <div class="cap">${E(i.billedTo||i.clientLabel)}</div>
        <p class="lead">${E(n.fullName)}</p>
        ${xe(e).map(e=>`<p>${E(e)}</p>`).join(``)}
      </div>
      <div>
        <div class="cap">${E(i.invoiceLabel)}</div>
        <div class="kv"><span>#</span><span>${E(r.number)}</span></div>
        <div class="kv"><span>${E(i.dateLabel)}</span><span>${E(e.date)}</span></div>
        <div class="kv"><span>${E(i.dueDateLabel)}</span><span>${E(e.dueText)}</span></div>
      </div>
    </div>
    ${M(e)}
    <table class="items">
      <thead>
        <tr>
          <th>${E(i.description)}</th>
          <th class="center">${E(i.quantity)}</th>
          <th class="right">${E(i.unit)}</th>
          <th class="right">${E(i.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${e.rows.map(e=>`<tr>
          <td class="pre">${E(e.description)}</td>
          <td class="center">${E(e.quantity)}</td>
          <td class="right nowrap">${o(e.unitPrice)}</td>
          <td class="right nowrap t">${o(e.lineTotal)}</td>
        </tr>`).join(``)}
      </tbody>
    </table>
    <div class="after keep">
      <div class="side">
        ${e.hasPayment?`<div class="block"><div class="cap">${E(i.paymentDetails||i.paymentInfo)}</div>${_e(e)}</div>`:``}
        ${r.notes?`<div class="block pre">${E(r.notes)}</div>`:``}
      </div>
      <div class="totals">
        <div class="kv"><span>${E(i.subtotal)}</span><span>${o(e.subtotal)}</span></div>
        ${e.discount>0?`<div class="kv"><span>${E(i.discount)}</span><span>-${o(e.discount)}</span></div>`:``}
        ${e.taxRate>0?`<div class="kv"><span>${E(i.vat||`VAT`)} ${e.taxRate}%</span><span>${o(e.taxAmount)}</span></div>`:``}
        <div class="kv grand"><span>${E(i.total)}</span><span>${o(e.total)}</span></div>
        ${e.showBalance?`<div class="kv" style="margin-top:8px"><span>${E(i.amountPaid||``)}</span><span>${o(e.paid)}</span></div><div class="kv" style="font-weight:700"><span style="color:#1D2B2E">${E(i.amountDue||i.total)}</span><span>${o(e.due)}</span></div>`:``}
      </div>
    </div>
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${e.signature?`<img src="${e.signature}" alt="" />`:``}</div>
        <div class="line"><b>${E(e.signerName)}</b>${P(e)}${E(i.issuedBy)}</div>
      </div>
      <div class="stamp">${e.stamp?`<img src="${e.stamp}" alt="" />`:``}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line"><b>${E(n.fullName)}</b>${P(e,!0)}${E(i.receivedBy)}</div>
      </div>
    </div>
    <div class="foot">${E(i.thankYou)}${e.exportNote?`<b>${E(e.exportNote)}</b>`:``}</div>
  `)}var Ae={classic:Ee,corporate:Oe,minimal:ke};function je(e){let t=he(e);return Ae[t.templateId](t)}function Me({company:e,template:t,accentColor:n,pdfLabels:r,sample:i}){let a=[{id:`1`,description:i.lines[0]||``,quantity:40,unitPrice:24},{id:`2`,description:i.lines[1]||``,quantity:1,unitPrice:350},{id:`3`,description:i.lines[2]||``,quantity:3,unitPrice:45}],o=e.defaultTaxRate||0;return je({company:e,client:{fullName:i.clientName,address:i.clientAddress,phone:``},invoice:{number:`INV-001`,date:i.date,dueDate:``,items:a,discount:0,taxRate:o,notes:``,status:`unpaid`,lifecycle:`issued`,payments:[]},pdfLabels:r,template:t,accentColor:n})}function Ne(e,t){let n=e?.taxRate;return n==null?{rate:K(t),fromClient:!1}:{rate:K(n),fromClient:!0}}var F=`Eksport ne bazë te Ligjit (05-L-037 Neni 33)`;function I(e){return e?.industry!==`services`}function L(e){return I(e)?!e||e.exportNote===void 0||e.exportNote===null?F:String(e.exportNote).trim():``}var R=[`JAN`,`FEB`,`MAR`,`APR`,`MAY`,`JUN`,`JUL`,`AUG`,`SEP`,`OCT`,`NOV`,`DEC`],Pe={EUR:`€`,USD:`$`,GBP:`£`,CHF:`CHF`,ALL:`L`,MKD:`ден`},Fe=[`EUR`,`USD`,`GBP`,`CHF`,`ALL`,`MKD`];function z(e){return Pe[e]||e||`€`}function B(e,t){return`${(Number.isFinite(e)?e:0).toFixed(2)}${z(t)}`}function Ie(e){let t=Math.round((Number(e)||0)*100);return t%100==0?String(t/100):(t/100).toFixed(2)}function V(e){let t=parseFloat(String(e??``).replace(`,`,`.`));return Number.isFinite(t)?t:0}function H(){return crypto.randomUUID()}function U(e,t=new Date){let n=e.filter(e=>e.lifecycle!==`draft`),r=n.filter(e=>/^\d{6}-\d+$/.test(e.number||``)).length;if(r>0&&r*2>n.length){let e=`${t.getFullYear()}${String(t.getMonth()+1).padStart(2,`0`)}`,r=n.reduce((t,n)=>{let r=(n.number||``).match(/^(\d{6})-(\d+)$/);return r&&r[1]===e?Math.max(t,Number(r[2])||0):t},0);return`${e}-${String(r+1).padStart(3,`0`)}`}let i=R[t.getMonth()],a=e.filter(e=>(e.number||``).startsWith(`${i}-`)).length;return`${i}-${String(a+1).padStart(3,`0`)}`}function W(e=new Date){let t=e instanceof Date?e:new Date(e);return`${R[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`}function G(e){return Math.round(e*100)/100}function K(e){let t=V(e);if(t<=0)return 0;let n=t<1?t*100:t;return Math.min(Math.round(n*100)/100,100)}function Le(e,t){return Math.round(V(e)/(1+K(t)/100)*1e8)/1e8}function Re(e,t){return G(V(e)*(1+K(t)/100))}function q(e,t,n=0){let r=(e||[]).reduce((e,t)=>e+V(t.quantity)*V(t.unitPrice),0),i=K(n),a=G(r),o=G(Math.max(a-G(V(t)),0)),s=i>0?G(Math.max(r-V(t),0)*(1+i/100)):o;return{subtotal:a,net:o,taxRate:i,taxAmount:G(s-o),total:s}}function J(e){return e?c(e):`unpaid`}function ze(e){let t=e=>String(e||``).split(`
`).map(e=>e.trim()).find(Boolean)||``;if(e?.revisions?.some(e=>e.type===`import`)){let n=t(e.notes);if(n)return n}let n=(e?.items||[]).map(e=>t(e.description)).filter(Boolean);return n.length===0?``:n.length>1?`${n[0]} +${n.length-1}`:n[0]}function Be(e){return String(e||``).trim().toLowerCase()}function Ve(e){let t=m(e.date)||m(e.createdAt);return t?t.getFullYear():null}function Y(e){return[...e].sort((e,t)=>{let n=m(e.date)?.getTime()||Date.parse(e.createdAt||``)||0,r=m(t.date)?.getTime()||Date.parse(t.createdAt||``)||0;return n===r?String(e.number||``).localeCompare(String(t.number||``)):n-r})}function He(e){let t=new Map;for(let n of e){let e=n.client?.fullName?.trim();if(!e)continue;let r=e.toLowerCase(),i=t.get(r);i||(i={client:n.client,unpaid:[],unpaidCount:0,unpaidTotal:0,paidTotal:0},t.set(r,i));let a=d(n);J(n)===`paid`?i.paidTotal+=Number(n.total)||0:J(n)!==`cancelled`&&J(n)!==`draft`&&(i.unpaid.push(n),i.unpaidCount+=1,i.unpaidTotal+=a)}return[...t.values()].filter(e=>e.unpaid.length>0).map(e=>({...e,unpaid:Y(e.unpaid)})).sort((e,t)=>e.client.fullName.localeCompare(t.client.fullName))}function Ue(e,t){let n=e=>e.clientId||e.client?.id||``,r=e=>String(e.client?.fullName||``).trim().toLowerCase(),i=e=>n(e)&&n(t)?n(e)===n(t):!!r(e)&&r(e)===r(t);return Y(e.filter(e=>i(e)&&d(e)>0))}function We(e){let t=new Date(e||``);if(Number.isNaN(t.getTime()))return``;let n=e=>String(e).padStart(2,`0`);return`${n(t.getDate())}.${n(t.getMonth()+1)}.${t.getFullYear()}, ${n(t.getHours())}:${n(t.getMinutes())}`}function Ge(e){return We(e.reminders?.[e.reminders.length-1]?.at)}function Ke(e,t){let n=new Map;for(let t of e){let e=String(t.fullName||``).trim().toLowerCase();e&&!n.has(e)&&n.set(e,t.id)}let r=new Map;for(let e of t){let t=e.clientId||e.client?.id||n.get(String(e.client?.fullName||``).trim().toLowerCase());if(!t)continue;let i=r.get(t);i?i.push(e):r.set(t,[e])}let i=e=>Math.round(e.reduce((e,t)=>e+t.amount,0)*100)/100,a=new Map;for(let[e,t]of r){let n=y(t,e=>s(e).total),r=y(t,e=>Math.round((s(e).total-d(e))*100)/100);a.set(e,{invoiced:n,paid:r,invoicedSum:i(n),paidSum:i(r)})}return a}function X(e=new Date){let t=e instanceof Date?e:new Date(e);return`${String(t.getDate()).padStart(2,`0`)}.${String(t.getMonth()+1).padStart(2,`0`)}.${t.getFullYear()}`}function qe(e,t=new Date){return`${String(e||`client`).trim().replace(/[<>:"/\\|?*]/g,``).replace(/\s+/g,` `).slice(0,60)||`client`}-${X(t)}.pdf`}function Je(e,t){return{number:U(t),date:W(new Date),dueDate:e.dueDate||``,status:`unpaid`,client:{...e.client},items:(e.items||[]).map(e=>({...e,id:H()})),discount:e.discount,taxRate:e.taxRate||0,pricesIncludeTax:!!e.pricesIncludeTax,unsigned:!!e.unsigned,contractName:e.contractName||``,contractNumber:e.contractNumber||``,notes:e.notes||``,subtotal:e.subtotal,total:e.total}}function Z(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function Ye(e,t,n){return e.flatMap(e=>{let r=e.items&&e.items.length>0?e.items:[{id:`1`,description:e.number,quantity:1,unitPrice:e.total}],i=r.map((n,r)=>{let i=V(n.quantity),a=V(n.unitPrice);return`<tr>
          <td class="order">${r===0?`<strong>${Z(e.number)}</strong><br/><span class="muted">${Z(e.date)}</span>`:``}</td>
          <td>${Z(n.description)}</td>
          <td class="right">${B(a,t)}</td>
          <td class="center">${Z(n.quantity)}</td>
          <td class="right">${B(i*a,t)}</td>
        </tr>`});V(e.discount)>0&&i.push(`<tr>
          <td></td>
          <td>${Z(n.discount)}</td>
          <td></td>
          <td></td>
          <td class="right">-${B(V(e.discount),t)}</td>
        </tr>`);let a=q(r,e.discount,e.taxRate);return a.taxAmount>0&&i.push(`<tr>
          <td></td>
          <td>${Z(n.vat||`VAT`)} ${a.taxRate}%</td>
          <td></td>
          <td></td>
          <td class="right">${B(a.taxAmount,t)}</td>
        </tr>`),i}).join(``)}function Xe({company:e,client:t,invoices:n,paidTotal:r,issuedDate:i,pdfLabels:a,showPayments:o=!1}){let s=e.currency||`EUR`,c=z(s),l=L(e),u=n.reduce((e,t)=>e+d(t),0),f=Number(r)||0,p=i||X(new Date),m=[e.zipCode,e.state].filter(Boolean).join(` `),h=a.pivaLabel||a.nuiLabel,g=Ye(n,s,a);return`<!DOCTYPE html>
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
        <h1>${Z(e.companyName)}</h1>
        ${e.streetAddress?`<p>${Z(e.streetAddress)}</p>`:``}
        ${m?`<p>${Z(m)}</p>`:``}
        ${e.nui?`<p>${Z(h)} ${Z(e.nui)}</p>`:``}
        ${e.email?`<p>${Z(e.email)}</p>`:``}
        ${e.phone?`<p>${Z(e.phone)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${Z(a.statementTitle||`PREVENTIVI`)}</h2>
        <p>${Z(a.dateLabel)}: ${Z(p)}</p>
      </div>
    </div>
    <div class="blocks">
      <div class="client-block">
        <div class="block-title">${Z(a.billedTo||a.clientLabel)}</div>
        <p><strong>${Z(t.fullName)}</strong></p>
        ${t.address?`<p>${Z(t.address)}</p>`:``}
        ${t.phone?`<p>${Z(t.phone)}</p>`:``}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="order">${Z(a.order||a.invoiceLabel)}</th>
          <th>${Z(a.patientService||a.description)}</th>
          <th class="right">${Z(a.unitPrice||a.unit)} (${c})</th>
          <th class="center">${Z(a.qty||a.quantity)}</th>
          <th class="right">${Z(a.sum)}</th>
        </tr>
      </thead>
      <tbody>${g}</tbody>
    </table>
    <div class="totals">
      <div><span>${Z(a.ordersTotal)}</span><span>${B(u,s)}</span></div>
      ${o?`<div><span>${Z(a.paymentsTotal)}</span><span>${B(f,s)}</span></div>`:``}
      <div class="total-row"><span>${Z(o?a.balanceDue:a.total)}</span><span>${B(u,s)}</span></div>
    </div>
    ${e.bankName||e.iban?`<div class="payment"><div class="block-title">${Z(a.paymentInfo)}</div>${e.bankName?`<p>${Z(a.bankName)}: ${Z(e.bankName)}</p>`:``}${e.iban?`<p>${Z(a.ibanLabel)}: ${Z(e.iban)}</p>`:``}</div>`:``}
    <div class="thank-you">${Z(a.thankYou)}</div>
    ${l?`<div class="export-law">${Z(l)}</div>`:``}
  </body>
  </html>`}function Ze(e,t){let n=document.createElement(`iframe`);n.style.position=`fixed`,n.style.right=`0`,n.style.bottom=`0`,n.style.width=`0`,n.style.height=`0`,n.style.border=`0`,document.body.appendChild(n);let r=n.contentDocument;if(!r)throw document.body.removeChild(n),Error(`Could not open print preview.`);r.open(),r.write(e),r.close();let i=r.querySelector(`title`);if(i)i.textContent=t;else{let e=r.createElement(`title`);e.textContent=t,r.head.appendChild(e)}setTimeout(()=>{n.contentWindow?.focus(),n.contentWindow?.print(),setTimeout(()=>document.body.removeChild(n),1e3)},250)}function Qe(e,t=`all`,n=new Date){return`${e}-${t===`paid`?`paguara`:t===`unpaid`?`papaguara`:`lista`}-${X(n)}.pdf`}function $e(e=`all`,t=new Date){return Qe(`faturat`,e,t)}function et(e=`paid`,t=new Date){return Qe(`detyrimet`,e,t)}function tt({company:e,obligations:t,issuedDate:n,pdfLabels:r}){let i=e.currency||`EUR`,a=n||X(new Date),o=[e.zipCode,e.state].filter(Boolean).join(` `),s=r.pivaLabel||r.nuiLabel,c=t.reduce((e,t)=>e+(Number(t.amount)||0),0),l=t.map(e=>`<tr>
        <td>${Z(e.vendor)}</td>
        <td>${Z(e.notes||e.description||``)}</td>
        <td>${Z(e.date||``)}</td>
        <td class="center">${e.proofName||e.proofData||e.proofUri?Z(r.proofYes||`Yes`):Z(r.proofNo||`—`)}</td>
        <td class="right">${B(Number(e.amount)||0,i)}</td>
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
        <h1>${Z(e.companyName)}</h1>
        ${e.streetAddress?`<p>${Z(e.streetAddress)}</p>`:``}
        ${o?`<p>${Z(o)}</p>`:``}
        ${e.nui?`<p>${Z(s)} ${Z(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${Z(r.paidObligationsTitle||`Paid`)}</h2>
        <p>${Z(r.dateLabel)}: ${Z(a)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${Z(r.vendor||`Vendor`)}</th>
          <th>${Z(r.description)}</th>
          <th>${Z(r.dateLabel)}</th>
          <th class="center">${Z(r.proofLabel||`Proof`)}</th>
          <th class="right">${Z(r.sum)}</th>
        </tr>
      </thead>
      <tbody>${l}</tbody>
    </table>
    <div class="totals"><span>${Z(r.total)}</span><span>${B(c,i)}</span></div>
  </body>
  </html>`}function nt({company:e,invoices:t,issuedDate:n,pdfLabels:r,client:i}){let a=e.currency||`EUR`,o=n||X(new Date),s=[e.zipCode,e.state].filter(Boolean).join(` `),l=r.pivaLabel||r.nuiLabel,u=t.reduce((e,t)=>t.status===`cancelled`||t.lifecycle===`cancelled`?e:e+d(t),0);if(i)return rt({company:e,invoices:t,dateLabel:o,cityLine:s,nuiLabel:l,pdfLabels:r,client:i});let f=t.map(e=>{let t=c(e),n=t===`paid`?r.statusPaid||`Paid`:t===`partial`?r.statusPartial||`Partial`:t===`cancelled`?r.statusCancelled||`Cancelled`:t===`draft`?r.statusDraft||`Draft`:r.statusUnpaid||`Unpaid`,i=Number(e.total)||0;return`<tr>
        <td>${Z(e.number||``)}</td>
        <td>${Z(e.client?.fullName||``)}</td>
        <td>${Z(e.date||``)}</td>
        <td>${Z(n)}</td>
        <td class="right">${B(i,e.currency||a)}</td>
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
        <h1>${Z(e.companyName)}</h1>
        ${e.streetAddress?`<p>${Z(e.streetAddress)}</p>`:``}
        ${s?`<p>${Z(s)}</p>`:``}
        ${e.nui?`<p>${Z(l)} ${Z(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${Z(r.listTitle||r.statementTitle||`List`)}</h2>
        <p>${Z(r.dateLabel)}: ${Z(o)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${Z(r.invoiceLabel)}</th>
          <th>${Z(r.clientLabel)}</th>
          <th>${Z(r.dateLabel)}</th>
          <th>${Z(r.statusLabel||``)}</th>
          <th class="right">${Z(r.sum)}</th>
        </tr>
      </thead>
      <tbody>${f}</tbody>
    </table>
    <div class="totals"><span>${Z(r.total)}</span><span>${B(u,a)}</span></div>
  </body>
  </html>`}function rt({company:e,invoices:t,dateLabel:n,cityLine:r,nuiLabel:i,pdfLabels:a,client:o}){let l=e.currency||`EUR`,u=e=>b(y(t,e),B),f=t.map(e=>{let t=c(e),n=t===`paid`?a.statusPaid||`Paid`:t===`partial`?a.statusPartial||`Partial`:t===`cancelled`?a.statusCancelled||`Cancelled`:t===`draft`?a.statusDraft||`Draft`:a.statusUnpaid||`Unpaid`,r=Number(e.total)||0,i=d(e),o=t===`draft`||t===`cancelled`?0:Math.max(r-i,0),s=e.currency||l;return`<tr>
        <td>${Z(e.number||``)}</td>
        <td>${Z(e.date||``)}</td>
        <td>${Z(e.dueDate||a.onReceipt||``)}</td>
        <td>${Z(n)}</td>
        <td class="right">${B(r,s)}</td>
        <td class="right">${B(o,s)}</td>
        <td class="right">${B(i,s)}</td>
      </tr>`}).join(``),p=e.bankName||e.iban?`<div class="payment"><div class="block-title">${Z(a.paymentInfo)}</div>${e.bankName?`<p>${Z(a.bankName)}: ${Z(e.bankName)}</p>`:``}${e.iban?`<p>${Z(a.ibanLabel)}: ${Z(e.iban)}</p>`:``}</div>`:``;return`<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p, .client-block p, .payment p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      .client-block { margin-bottom: 18px; }
      .block-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; white-space: nowrap; }
      .sums { width: 300px; margin-left: auto; }
      .sums div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
      .sums .due { font-weight: 700; font-size: 16px; border-top: 2px solid #2C6E7F; margin-top: 4px; padding-top: 8px; color: #1F4E5A; }
      .payment { margin-top: 20px; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${Z(e.companyName)}</h1>
        ${e.streetAddress?`<p>${Z(e.streetAddress)}</p>`:``}
        ${r?`<p>${Z(r)}</p>`:``}
        ${e.nui?`<p>${Z(i)} ${Z(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${Z(a.listTitle||a.statementTitle||`List`)}</h2>
        <p>${Z(a.dateLabel)}: ${Z(n)}</p>
      </div>
    </div>
    <div class="client-block">
      <div class="block-title">${Z(a.billedTo||a.clientLabel)}</div>
      <p><strong>${Z(o.fullName||``)}</strong></p>
      ${o.address?`<p>${Z(o.address)}</p>`:``}
      ${o.phone?`<p>${Z(o.phone)}</p>`:``}
      ${o.email?`<p>${Z(o.email)}</p>`:``}
    </div>
    <table>
      <thead>
        <tr>
          <th>${Z(a.invoiceLabel)}</th>
          <th>${Z(a.dateLabel)}</th>
          <th>${Z(a.dueDateLabel)}</th>
          <th>${Z(a.statusLabel||``)}</th>
          <th class="right">${Z(a.sum)}</th>
          <th class="right">${Z(a.paidLabel||``)}</th>
          <th class="right">${Z(a.remainingLabel||``)}</th>
        </tr>
      </thead>
      <tbody>${f}</tbody>
    </table>
    <div class="sums">
      <div><span>${Z(a.invoicedLabel||a.total)}</span><span>${u(e=>s(e).total)}</span></div>
      <div><span>${Z(a.paidLabel||``)}</span><span>${u(e=>s(e).total-d(e))}</span></div>
      <div class="due"><span>${Z(a.remainingLabel||a.total)}</span><span>${u(e=>d(e))}</span></div>
    </div>
    ${p}
  </body>
  </html>`}function it(e=new Date){return`pasqyra-${X(e)}.pdf`}function at({company:e,report:t,periodText:n,issuedDate:r,pdfLabels:i,notes:a=[]}){let o=t.currency||e.currency||`EUR`,s=r||X(new Date),c=[e.zipCode,e.state].filter(Boolean).join(` `),l=i.pivaLabel||i.nuiLabel,u=[[i.invoiced,t.invoiced],[i.received,t.paymentsReceived],[i.obligationsRecorded,t.obligationsRecorded],[i.paidOut,t.paymentsMade],[i.receivables,t.receivables],[i.payables,t.payables],[i.netPayments,t.netPayments]].map(([e,t])=>`<tr><td>${Z(String(e))}</td><td class="right">${B(Number(t)||0,o)}</td></tr>`).join(``),d=(t.customers||[]).map(e=>`<tr><td>${Z(e.client?.fullName||``)}</td><td class="right">${B(e.amount,o)}</td></tr>`).join(``),f=(t.overduePayables||[]).map(e=>`<tr><td>${Z(e.vendor||``)}</td><td>${Z(e.dueDate||``)}</td><td class="right">${B(e.amountDueAsOf||0,o)}</td></tr>`).join(``),p=a.length?`<div class="notes"><div class="block-title">${Z(i.limitationTitle||``)}</div>${a.map(e=>`<p>${Z(e)}</p>`).join(``)}</div>`:``;return`<!DOCTYPE html>
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
        <h1>${Z(e.companyName)}</h1>
        ${e.streetAddress?`<p>${Z(e.streetAddress)}</p>`:``}
        ${c?`<p>${Z(c)}</p>`:``}
        ${e.nui?`<p>${Z(l)} ${Z(e.nui)}</p>`:``}
      </div>
      <div class="invoice-meta">
        <h2>${Z(i.pdfTitle||i.listTitle||`Overview`)}</h2>
        <p>${Z(i.period||``)}: ${Z(n)}</p>
        <p>${Z(i.asOf||``)}: ${Z(t.period?.endIso||s)}</p>
        <p>${Z(i.dateLabel)}: ${Z(s)}</p>
        <p>${Z(o)}</p>
      </div>
    </div>
    <p class="hint">${Z(i.netHint||``)}</p>
    <table>
      <thead><tr><th>${Z(i.summary||``)}</th><th class="right">${Z(i.sum)}</th></tr></thead>
      <tbody>${u}</tbody>
    </table>
    <h3>${Z(i.customers||``)}</h3>
    <table>
      <thead><tr><th>${Z(i.clientLabel)}</th><th class="right">${Z(i.sum)}</th></tr></thead>
      <tbody>${d||`<tr><td colspan="2">${Z(i.empty||``)}</td></tr>`}</tbody>
    </table>
    <h3>${Z(i.overdue||``)}</h3>
    <table>
      <thead><tr><th>${Z(i.vendor||``)}</th><th>${Z(i.dateLabel)}</th><th class="right">${Z(i.sum)}</th></tr></thead>
      <tbody>${f||`<tr><td colspan="3">${Z(i.empty||``)}</td></tr>`}</tbody>
    </table>
    ${p}
  </body>
  </html>`}var ot={companyName:[`Kompania juaj (shembull)`,`Your company (sample)`,`La tua azienda (esempio)`],contactPerson:[`Emri juaj (shembull)`,`Your name (sample)`,`Il tuo nome (esempio)`],nui:[`000000000`],streetAddress:[`Rruga shembull, nr. 1`,`Example street, no. 1`,`Via esempio, n. 1`],state:[`Kosovë`,`Kosovo`],zipCode:[`10000`],email:[`email@shembull.com`,`email@example.com`,`email@esempio.com`],phone:[`+383 00 000 000`]},st={companyName:`profile.phCompanyName`,contactPerson:`profile.phContactPerson`,nui:`profile.phNui`,streetAddress:`profile.phStreetAddress`,state:`profile.phState`,zipCode:`profile.phZipCode`,email:`profile.phEmail`,phone:`profile.phPhone`},Q=Object.keys(ot);function $(e,t){let n=String(t??``).trim();return!n||ot[e].includes(n)}function ct(e,t){return $(e,t)?``:String(t??``)}function lt(e){let t={...e};for(let n of Q)$(n,e[n])&&(t[n]=``);return t.currency=e.currency?.trim()||`EUR`,(e.exportNote===void 0||e.exportNote===null)&&(t.exportNote=F),t}function ut(e,t){let n={...e};for(let r of Q)$(r,e[r])&&(n[r]=t(st[r]));return n.currency=e.currency?.trim()||t(`profile.phCurrency`),n.bankName=e.bankName||``,n.iban=e.iban||``,n.exportNote=e.exportNote===void 0||e.exportNote===null?F:e.exportNote,n}function dt(e,t,n){let r=ut(t,n),i=e?.companySnapshot;if(!i)return r;let a={};for(let e of[`companyName`,`contactPerson`,`nui`,`vatNumber`,`streetAddress`,`state`,`zipCode`,`email`,`phone`,`website`,`bankName`,`iban`,`accountNumber`,`swift`])(Q.includes(e)&&$(e,i[e])||!String(i[e]??``).trim())&&String(r[e]??``).trim()&&(a[e]=r[e]);return{...i,...a,industry:i.industry??r.industry,logoData:r.logoData,signatureData:r.signatureData,signers:r.signers,defaultSignerId:r.defaultSignerId,stampData:r.stampData,invoiceTemplate:r.invoiceTemplate,accentColor:r.accentColor}}export{ae as $,Ve as A,V as B,X as C,$e as D,Re as E,it as F,je as G,ue as H,Ue as I,T as J,Me as K,Y as L,Le as M,K as N,J as O,et as P,C as Q,Ne as R,We as S,U as T,le as U,I as V,w as W,S as X,ne as Y,x as Z,Ze as _,l as _t,lt as a,b as at,W as b,t as bt,nt as c,_ as ct,Xe as d,c as dt,oe as et,Be as f,d as ft,z as g,y as gt,q as h,ee as ht,ut as i,s as it,Ge as j,ze as k,at as l,a as lt,He as m,te as mt,ct as n,o as nt,Fe as o,f as ot,Ke as p,v as pt,de as q,$ as r,g as rt,F as s,u as st,dt as t,se as tt,tt as u,m as ut,Je as v,r as vt,H as w,B as x,Ie as y,n as yt,qe as z};