# @namoidhq/react

React SDK for **NamoID** — identity infrastructure for India (OAuth 2.1 / OpenID Connect). Wrap your app in a provider, then use hooks and components for hosted sign-in, sign-up, and waitlist flows.

```bash
npm i @namoidhq/react @namoidhq/js
```

```tsx
import { NamoIDProvider, SignIn } from "@namoidhq/react";

export function App() {
  return (
    <NamoIDProvider publishableKey="pk_live_...">
      <SignIn
        clientId="your_client_id"
        redirectUri="https://your-app.com/callback"
      />
    </NamoIDProvider>
  );
}
```

React components are UI-only. They redirect to hosted login and never store OAuth tokens. For server-side callback handling in Next.js, use [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs).

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
