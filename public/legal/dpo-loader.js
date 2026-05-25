// Populate the DPO contact block from the live endpoint so a
// single source of truth (DEFAULT_DPO_CONTACT) drives both the
// app and this static page.
fetch('/api/dpdp/grievance')
  .then((r) => r.json())
  .then((data) => {
    const block = document.getElementById('dpoContact');
    if (!block || !data?.contact) return;
    const c = data.contact;
    block.textContent =
      `${c.name}\n` +
      `Email: ${c.email}\n` +
      `Post:  ${c.postal}\n` +
      `Response SLA: ${c.responseSlaDays} days`;
  })
  .catch(() => {});
