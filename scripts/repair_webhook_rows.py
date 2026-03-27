import sqlite3

DB_PATH = 'scripts/n8n_database.sqlite'
WORKFLOW_ID = 'ryh6GQxWYOScR2ig'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT workflowId, webhookPath, method FROM webhook_entity WHERE workflowId = ?", (WORKFLOW_ID,))
print('before', cur.fetchall())

cur.execute(
    "DELETE FROM webhook_entity WHERE workflowId = ? AND method = ? AND webhookPath = ?",
    (WORKFLOW_ID, 'POST', 'alerta')
)
print('deleted_rows', cur.rowcount)

cur.execute("SELECT workflowId, webhookPath, method FROM webhook_entity WHERE workflowId = ?", (WORKFLOW_ID,))
print('after', cur.fetchall())

conn.commit()
conn.close()
