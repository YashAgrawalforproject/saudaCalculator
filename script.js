document.addEventListener('DOMContentLoaded', () => {
  const saudaBody   = document.querySelector('#sauda-table tbody');
  const returnsBody = document.querySelector('#returns-table tbody');
  const resultsBody = document.querySelector('#results-table tbody');
  const overBody    = document.querySelector('#overdeliver-table tbody');
  const PACKET_TO_QUINTAL = 0.3;

  // Add / remove row helpers
  function addRow(tbody) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input class="quantity" type="number" step="any"/></td>
      <td><input class="rate" type="number" step="any"/></td>
      <td><input class="date" type="date"/></td>
      <td><button class="remove-row">Remove</button></td>`;
    row.querySelector('.remove-row').onclick = () => row.remove();
    tbody.appendChild(row);
  }
  document.getElementById('add-sauda-row').onclick   = () => addRow(saudaBody);
  document.getElementById('add-returns-row').onclick = () => addRow(returnsBody);

  // Read and validate table data
  function readTable(tbody) {
    return Array.from(tbody.rows).map(r => {
      const qty  = parseFloat(r.querySelector('.quantity').value) || 0;
      const rate = parseFloat(r.querySelector('.rate').value) || 0;
      const date = r.querySelector('.date').value || '';
      const ok   = qty > 0 && rate > 0 && date;
      r.classList.toggle('invalid', !ok);
      return ok ? { qty: +qty.toFixed(2), rate: +rate.toFixed(2), date } : null;
    }).filter(x => x);
  }

  // Render matched contracts and build contracts list
  function renderContracts(sauda, returns) {
    const contracts = sauda.map(e => ({ ...e, remaining: e.qty, lastDelivery: '' }));
    const overArr = [];

    returns.forEach(d => {
      let left = d.qty;
      // FIFO match by rate
      contracts.filter(c => c.rate === d.rate).forEach(c => {
        if (left <= 0) return;
        const use = Math.min(c.remaining, left);
        c.remaining -= use;
        left -= use;
        if (use > 0) {
          c.lastDelivery = c.lastDelivery
            ? (d.date > c.lastDelivery ? d.date : c.lastDelivery)
            : d.date;
        }
      });
      // any leftover is over-delivery
      if (left > 0) overArr.push({ qty: left, rate: d.rate, date: d.date });
    });

    // Populate Matched Remaining table
    resultsBody.innerHTML = '';
    contracts.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.qty.toFixed(2)}</td>
        <td>${c.rate.toFixed(2)}</td>
        <td>${c.date}</td>
        <td>${c.remaining.toFixed(2)}</td>
        <td>${c.lastDelivery}</td>`;
      resultsBody.appendChild(tr);
    });

    // Populate Over-Deliveries table
    overBody.innerHTML = '';
    overArr.forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${o.qty.toFixed(2)}</td><td>${o.rate.toFixed(2)}</td><td>${o.date}</td>`;
      overBody.appendChild(tr);
    });

    return contracts;
  }

  // Calculate raw (unadjusted) metrics
  function calculateRaw(sauda, returns) {
    let totalS = 0, valS = 0, totalR = 0, valR = 0;
    sauda.forEach(e => { totalS += e.qty; valS += e.qty * PACKET_TO_QUINTAL * e.rate; });
    returns.forEach(e => { totalR += e.qty; valR += e.qty * PACKET_TO_QUINTAL * e.rate; });
    const simpleRem = +(totalS - totalR).toFixed(2);
    const netQty    = +(totalR - totalS).toFixed(2);
    const diffVal   = +(valR - valS).toFixed(2);
    const netRate   = netQty
      ? +((diffVal) / (netQty * PACKET_TO_QUINTAL)).toFixed(2)
      : 0;
    return { totalS, totalR, simpleRem, netQty, netRate, netMoney: diffVal };
  }

  // Calculate over-deliveries only metrics from fresh contracts
  function calculateOverDeliveries(sauda, returns) {
    // Rebuild contracts just to compute over
    const contracts = sauda.map(e => ({ ...e, remaining: e.qty }));
    let overQty = 0, overVal = 0;
    returns.forEach(d => {
      let left = d.qty;
      contracts.filter(c => c.rate === d.rate).forEach(c => {
        if (left <= 0) return;
        const use = Math.min(c.remaining, left);
        c.remaining -= use;
        left -= use;
      });
      if (left > 0) {
        overQty += left;
        overVal += left * PACKET_TO_QUINTAL * d.rate;
      }
    });
    const netQty  = +overQty.toFixed(2);
    const netRate = netQty
      ? +((overVal) / (netQty * PACKET_TO_QUINTAL)).toFixed(2)
      : 0;
    return { overQty, netQty, netRate, netMoney: +overVal.toFixed(2) };
  }

  // CSV download helper
  function downloadCSV(name, content) {
    const blob = new Blob([content], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  // On Calculate click
  document.getElementById('calculate').onclick = () => {
    const sauda   = readTable(saudaBody);
    const returns = readTable(returnsBody);

    // Render tables
    const contracts = renderContracts(sauda, returns);

    // 1. Raw Totals
    const raw = calculateRaw(sauda, returns);
    const rawVerdictQty = raw.netQty > 0 ? '→ Sell' : raw.netQty < 0 ? '→ Buy' : '';
    const rawVerdictMoney = raw.netMoney > 0 ? '→ Profit' : raw.netMoney < 0 ? '→ Loss' : '';
    document.getElementById('raw-total-sauda').textContent      = raw.totalS.toFixed(2);
    document.getElementById('raw-total-return').textContent     = raw.totalR.toFixed(2);
    document.getElementById('raw-remaining-simple').textContent = raw.simpleRem.toFixed(2);
    document.getElementById('raw-net-qty').innerHTML            = `${raw.netQty.toFixed(2)} pkts <span class="${raw.netQty>=0?'verdict-	positive':'verdict-negative'}">${rawVerdictQty}</span>`;
    document.getElementById('raw-net-rate').textContent         = raw.netRate.toFixed(2);
    document.getElementById('raw-net-money').innerHTML          = `₹${raw.netMoney.toFixed(2)} <span class="${raw.netMoney>=0?'verdict-	positive':'verdict-negative'}">${rawVerdictMoney}</span>`;

    // 2. Over-Deliveries Only
    const over = calculateOverDeliveries(sauda, returns);
    const overVerdictQty = over.netQty > 0 ? '→ Sell' : over.netQty < 0 ? '→ Buy' : '';
    const overVerdictMoney = over.netMoney > 0 ? '→ Profit' : over.netMoney < 0 ? '→ Loss' : '';
    document.getElementById('over-total-qty').textContent       = over.overQty.toFixed(2);
    document.getElementById('over-net-qty').innerHTML           = `${over.netQty.toFixed(2)} pkts <span class="${over.netQty>=0?'verdict-	positive':'verdict-negative'}">${overVerdictQty}</span>`;
    document.getElementById('over-net-rate').textContent        = over.netRate.toFixed(2);
    document.getElementById('over-net-money').innerHTML         = `₹${over.netMoney.toFixed(2)} <span class="${over.netMoney>=0?'verdict-	positive':'verdict-negative'}">${overVerdictMoney}</span>`;
    document.getElementById('results').style.display = '';
    document.getElementById('summary').style.display = '';
  };

  // Export Main Analysis (summaries only)
  document.getElementById('export-main').onclick = () => {
    const party = document.getElementById('party-name').value || 'Unnamed Party';
    const r = document.getElementById.bind(document);
    let csv = `Party Name,${party}\n\nSauda bacha hai usse barabar\n` +
              `Total Sauda,${r('raw-total-sauda').textContent}\n` +
              `Total Delivery,${r('raw-total-return').textContent}\n` +
              `Remaining,${r('raw-remaining-simple').textContent}\n` +
              `Net Pos,${r('raw-net-qty').textContent}\n` +
              `Rate,₹${r('raw-net-rate').textContent}\n` +
              `Impact,₹${r('raw-net-money').textContent}\n\n` +
              `Over-Deliveries Summary\n` +
              `Total Over,${r('over-total-qty').textContent}\n` +
              `Net Pos,${r('over-net-qty').textContent}\n` +
              `Rate,₹${r('over-net-rate').textContent}\n` +
              `Impact,₹${r('over-net-money').textContent}\n`;
    downloadCSV('main_analysis.csv', csv);
  };

  // Export Full Detailed Report
  document.getElementById('export-full').onclick = () => {
    const party = document.getElementById('party-name').value || 'Unnamed Party';
    const sauda = readTable(saudaBody), ret = readTable(returnsBody);
    // Re-render to ensure tables up to date
    const contracts = renderContracts(sauda, ret);

    // Build CSV
    let csv = `Party Name,${party}\n\n` +
              `Sauda Entries\nPackets,Rate,Date\n` +
              sauda.map(e=>`${e.qty},${e.rate},${e.date}`).join('\n') +
              `\n\nDelivery Entries\nPackets,Rate,Date\n` +
              ret.map(e=>`${e.qty},${e.rate},${e.date}`).join('\n') +
              `\n\nRemaining Contracts\nOrig,Rate,Date,Remaining,LastDelivery\n` +
              Array.from(document.querySelectorAll('#results-table tbody tr'))
                   .map(r=>Array.from(r.children).map(td=>td.innerText).join(',')).join('\n') +
              `\n\nOver Deliveries\nQty,Rate,Date\n` +
              Array.from(document.querySelectorAll('#overdeliver-table tbody tr'))
                   .map(r=>Array.from(r.children).map(td=>td.innerText).join(',')).join('\n') +
              `\n\nSauda bacha hai usse barabar\nTotal Sauda,Total Delivery,Remaining,Net Pos,Rate,Impact\n` +
              `${document.getElementById('raw-total-sauda').textContent},` +
              `${document.getElementById('raw-total-return').textContent},` +
              `${document.getElementById('raw-remaining-simple').textContent},` +
              `${document.getElementById('raw-net-qty').textContent},` +
              `${document.getElementById('raw-net-rate').textContent},` +
              `${document.getElementById('raw-net-money').textContent}\n\n` +
              `Koi sauda nahi bacha\nTotal Over,Net Pos,Rate,Impact\n` +
              `${document.getElementById('over-total-qty').textContent},` +
              `${document.getElementById('over-net-qty').textContent},` +
              `${document.getElementById('over-net-rate').textContent},` +
              `${document.getElementById('over-net-money').textContent}\n`;
    downloadCSV('full_detailed_report.csv', csv);
  };
});
