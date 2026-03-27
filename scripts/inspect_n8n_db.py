import sqlite3

DB_PATH = 'scripts/n8n_database.sqlite'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [row[0] for row in cur.fetchall()]
print('tables_count', len(tables))

for name in tables:
    lower = name.lower()
    if 'webhook' in lower or 'workflow' in lower or 'execution' in lower:
        print('table', name)

if 'webhook_entity' in tables:
    cur.execute("PRAGMA table_info(webhook_entity)")
    columns = [row[1] for row in cur.fetchall()]
    print('webhook_entity_columns', columns)

    select_columns = []
    for candidate in ('workflowId', 'webhookId', 'pathLength', 'method', 'path', 'webhookPath', 'node', 'nodeId'):
        if candidate in columns:
            select_columns.append(candidate)

    if select_columns:
        projection = ', '.join(select_columns)
        cur.execute(f"SELECT {projection} FROM webhook_entity ORDER BY rowid DESC LIMIT 50")
        rows = cur.fetchall()
        print('webhook_entity_rows', len(rows))
        for row in rows:
            print('webhook', row)
    else:
        print('No known webhook columns found to query')
else:
    print('webhook_entity table not found')

conn.close()
