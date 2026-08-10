import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NamoIDProvider,
  NamoIDNativeEmailOtpSignIn,
  NamoIDSignIn,
  NamoIDSignInModal,
} from "../dist/index.js";

const clientId = "namoid_client_test_react";
const commonProps = {
  redirectUri: "https://app.example.com/auth/namoid/popup",
  onComplete() {},
};

function insideProvider(child) {
  return createElement(NamoIDProvider, { clientId }, child);
}

test("drop-in sign-in renders a safe loading state and NamoID trust mark", () => {
  const markup = renderToStaticMarkup(
    insideProvider(createElement(NamoIDSignIn, commonProps)),
  );

  assert.match(markup, /Sign in/);
  assert.match(markup, /Loading sign-in…/);
  assert.match(markup, /Secured by NamoID/);
  assert.match(markup, /disabled/);
  assert.doesNotMatch(markup, /type="password"/);
});

test("modal wrapper exposes an accessible dialog and close control", () => {
  const markup = renderToStaticMarkup(
    insideProvider(
      createElement(NamoIDSignInModal, {
        ...commonProps,
        open: true,
        onOpenChange() {},
        title: "Continue to Example",
      }),
    ),
  );

  assert.match(markup, /<dialog/);
  assert.match(markup, /aria-label="Continue to Example"/);
  assert.match(markup, /aria-label="Close sign-in"/);
  assert.match(markup, /Continue to Example/);
});

test("native email OTP drop-in renders a safe loading state", () => {
  const markup = renderToStaticMarkup(
    insideProvider(
      createElement(NamoIDNativeEmailOtpSignIn, {
        ...commonProps,
      }),
    ),
  );

  assert.match(markup, /Email/);
  assert.match(markup, /Continue with email/);
  assert.match(markup, /Secured by NamoID/);
  assert.match(markup, /<input[^>]*id="namoid-native-email"[^>]*disabled=""/);
  assert.doesNotMatch(markup, /type="password"/);
});
