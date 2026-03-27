(async () => {
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmFidGt1Z2Z6Zmlud3ZmdXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ1MjM4OCwiZXhwIjoyMDkwMDI4Mzg4fQ.9WZ6RuQ6wpXhVHy2vpDIun9-9xMVDBsysCOGTBuDyEU';
  const base = 'https://krnabtkugfzfinwvfuzm.supabase.co/rest/v1';
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: 'return=representation'
  };

  for (const table of ['eventos', 'leads']) {
    const url = `${base}/${table}?visitor_id=like.${encodeURIComponent('test-%')}`;
    const response = await fetch(url, { method: 'DELETE', headers });
    const text = await response.text();
    console.log(`deleted_${table}`, response.status, text.slice(0, 200));
  }

  const leadCheck = await fetch(`${base}/leads?select=visitor_id&visitor_id=like.${encodeURIComponent('test-%')}`, { headers });
  const eventCheck = await fetch(`${base}/eventos?select=visitor_id&visitor_id=like.${encodeURIComponent('test-%')}`, { headers });

  console.log('remaining_leads', await leadCheck.text());
  console.log('remaining_eventos', await eventCheck.text());
})();
