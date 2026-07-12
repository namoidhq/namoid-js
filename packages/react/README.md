# @namoidhq/react

React SDK for **NamoID** — hosted identity infrastructure for India. Wrap your app in a provider, then use components for Hosted Auth sign-in, sign-up, and waitlist flows.

```bash
npm i @namoidhq/react @namoidhq/js
```

```tsx
import { NamoIDProvider, SignIn } from "@namoidhq/react";

export function App() {
  return (
    <NamoIDProvider publishableKey="namoid_auth_pk_live_...">
      <SignIn returnTo="https://your-app.com/auth/callback" />
    </NamoIDProvider>
  );
}
```

React components use Hosted Auth, create a public PKCE transaction, and never store durable refresh tokens. For server-side callback handling in Next.js, use [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs).

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
