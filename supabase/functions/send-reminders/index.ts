// Sends due Kompass reminders as Web Push notifications.
// Called every 5 minutes by pg_cron (header x-cron-secret). Secrets live in Supabase Vault.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  const { data: secrets, error: secErr } = await admin.rpc('push_secrets')
  if (secErr || !secrets) return new Response('no secrets', { status: 500 })
  if (req.headers.get('x-cron-secret') !== secrets.cron_secret) return new Response('forbidden', { status: 403 })
  webpush.setVapidDetails('mailto:kompass@example.com', secrets.vapid_public, secrets.vapid_private)

  const now = new Date()
  const { data: due, error } = await admin
    .from('reminders')
    .select('user_id,key,title,body,url,fire_at')
    .is('sent_at', null)
    .lte('fire_at', now.toISOString())
    .gte('fire_at', new Date(now.getTime() - 6 * 3600_000).toISOString()) // don't send very stale ones
    .limit(200)
  if (error) return new Response(error.message, { status: 500 })
  if (!due?.length) return Response.json({ sent: 0 })

  const users = [...new Set(due.map((r) => r.user_id))]
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,user_id,p256dh,auth').in('user_id', users)
  let sent = 0
  const dead: string[] = []
  for (const r of due) {
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url ?? '#/', tag: r.key })
    for (const s of (subs ?? []).filter((x) => x.user_id === r.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint)
        else console.error('push failed', code, (e as Error).message)
      }
    }
    await admin.from('reminders').update({ sent_at: now.toISOString() }).eq('user_id', r.user_id).eq('key', r.key)
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  return Response.json({ sent, reminders: due.length, removed: dead.length })
})
