# @namoidhq/react

React SDK for **NamoID** — enterprise identity for India (OAuth 2.1 / OpenID Connect). Wrap your app in a provider, then use the hooks and components for hosted sign-in, sign-up, and waitlist flows.

```bash
npm i @namoidhq/react @namoidhq/js
```

```tsx
import { NamoIDProvider, useNamoID } from "@namoidhq/react";

export function App() {
  return (
    <NamoIDProvider publishableKey="pk_live_...">
      <YourApp />
    </NamoIDProvider>
  );
}
```

Built on [`@namoidhq/js`](https://www.npmjs.com/package/@namoidhq/js).

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
