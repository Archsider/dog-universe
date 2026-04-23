import { NextResponse } from 'next/server'

/**
 * Test endpoint — sms-gate.app cloud API (Basic Auth legacy).
 *
 * Doc: https://docs.sms-gate.app/integration/api/
 *
 * Example request:
 *   POST https://api.sms-gate.app/3rdparty/v1/message
 *   Authorization: Basic base64(username:password)
 *   Content-Type: application/json
 *   { "textMessage": { "text": "..." }, "phoneNumbers": ["+..."] }
 *
 * Set SMS_GATEWAY_URL to the base URL (e.g. https://api.sms-gate.app/3rdparty/v1).
 * SMS_GATEWAY_DEVICE_ID is optional — routes to a specific device if your
 * account has multiple devices registered.
 */
export async function GET() {
  try {
    const rawUrl = process.env.SMS_GATEWAY_URL
    const username = process.env.SMS_GATEWAY_USERNAME
    const password = process.env.SMS_GATEWAY_PASSWORD
    const deviceId = process.env.SMS_GATEWAY_DEVICE_ID

    if (!rawUrl || !username || !password) {
      return NextResponse.json({ error: 'SMS_GATEWAY env vars missing' }, { status: 500 })
    }

    // Strip trailing slash so `${base}/message` never produces `//message`
    const base = rawUrl.replace(/\/+$/, '')
    const endpoint = `${base}/message`

    const body: Record<string, unknown> = {
      textMessage: {
        text: '🐕 Test SMS Dog Universe — si tu reçois ce message, le système fonctionne !',
      },
      phoneNumbers: ['+212669183981'],
    }
    if (deviceId) {
      body.deviceId = deviceId
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify(body),
    })

    // API may return non-JSON error bodies — read as text and try to parse
    const raw = await response.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = raw }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      endpoint,
      requestBody: body,
      response: parsed,
    })

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
