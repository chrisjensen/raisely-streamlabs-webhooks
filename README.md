# Raisely -> Streamlabs Event Forwarder

Simple cloud function to forward [Raisely](https://raisely.com) webhooks to [Streamlabs](https://streamlabs.io)
so you and your viewers can see donations or actions taken during livestream.

## Usage

1. Get an [OAuth token](https://dev.streamlabs.com/docs/oauth-2) from Streamlabs
2. Edit [streamlabs.js](./streamlabs.js) and add your Raisely Campaign UUID and Streamlabs token to `campaignTokens`
3. Create a node Cloud Function (we use [Google](https://console.cloud.google.com/functions/)) and either deploy this or copy streamlabs.js and package.json
4. Set up a webhook in Raisely to forward donation.succeeded events to the cloud function (make sure you use the secret set in `authSecret`)

The cloud function will map the Raisely webhooks to a Streamlabs API call

## Bonus: Custom Alerts

You can also use this cloud function to generate custom [alerts](https://streamlabs.com/obs-widgets/alert-box)
for any action taken by your audience (eg alert when people sign your petition)

If you're sending this action from the browser, make sure you add the host name to `allowedOrigins` so that
the request won't be blocked by CORS.

Set up some javascript or a webhook to send an event that's the same shape as a Raisely webhook, but with an action of
`action.taken`, for example

```javascript
function sendAction(name) {
    const body = {
        secret: 'sh!',
        data: {
            source: `campaign:830a1280-6e17-11ea-858b-f7d7d2f43749`,
            type: 'action.taken',
            data: {
                username: name,
                message: `${name} signed the petition!`,
            },
        },
    };
    const options = {
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(body),
    };

    console.log('Doing fetch', url, opts);
    return fetch(url, opts);
}
```

## Testing

```bash
npm test
# or continuous testing
npx mocha -w *.test.js
```
