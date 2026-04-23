import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const url = process.env.SMS_GATEWAY_URL
    const username = process.env.SMS_GATEWAY_USERNAME
    const password = process.env.SMS_GATEWAY_PASSWORD
    const deviceId = process.env.SMS_GATEWAY_DEVICE_ID

    if (!url || !username || !password) {
      return NextResponse.json({ error: 'SMS_GATEWAY env vars missing' }, { status: 500 })
    }

    const response = await fetch(`${url}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        message: '🐕 Test SMS Dog Universe — si tu reçois ce message, le système fonctionne !',
        phoneNumbers: ['+212669183981'],
        deviceId: deviceId,
      }),
    })

    const data = await response.json()
    return NextResponse.json({ success: true, response: data })

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
