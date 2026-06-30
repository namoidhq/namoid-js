# @namoidhq/js

Core JavaScript SDK for **NamoID** — enterprise identity infrastructure for India (OAuth 2.1 / OpenID Connect). Build hosted-login URLs, fetch your project's auth config, and run sign-in, sign-up, and waitlist flows from any JavaScript runtime.

```bash
npm i @namoidhq/js
```

```js
import { createNamoIDClient } from "@namoidhq/js";

const namoid = createNamoIDClient({ publishableKey: "pk_live_..." });

namoid.hostedLogin.redirect({
  mode: "signin",
  clientId: "your_client_id",
  redirectUri: "https://your-app.com/callback",
});
```

For React, use [`@namoidhq/react`](https://www.npmjs.com/package/@namoidhq/react).

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
