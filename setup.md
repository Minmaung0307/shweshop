# 0) Setup Checklist (read first)

1. Firebase Project → Enable Authentication (Email/Password + GitHub), Firestore, Storage.

- In Authentication → Sign‑in method, add GitHub Provider (Client ID/Secret from GitHub OAuth App). Add your authorized domains.

- In Firestore create these collections on first write: items, orders, ads, feedback, users, promotions.

- In Storage create a folder items/ for product images.

2. Update firebaseConfig in app.js with your keys.

3. PayPal → Replace PAYPAL_CLIENT_ID in index.html (search for YOUR_PAYPAL_CLIENT_ID) or set via loadPayPal() params.

4. EmailJS → Create service and template. Replace EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID in app.js.

5. Local dev → Just open index.html with a local server (e.g., VS Code Live Server). For Storage uploads, you must serve over http:// or https:// with allowed domain.

6. Firestore Security Rules (starter – tighten later!)

```rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() { return isSignedIn() && request.auth.token.admin == true; }

    match /users/{uid} {
      allow read: if isSignedIn() && request.auth.uid == uid || isAdmin();
      allow write: if request.auth.uid == uid || isAdmin();
    }

    match /items/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /orders/{id} {
      allow read: if isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isAdmin();
    }

    match /ads/{id} { allow read: if true; allow write: if isAdmin(); }
    match /promotions/{id} { allow read: if true; allow write: if isAdmin(); }
    match /feedback/{id} {
      allow create: if true; // allow anyone to send feedback
      allow read, update, delete: if isAdmin();
    }
  }
}```

To mark yourself admin, set a custom claim from your server/Cloud Function, or temporarily loosen rules while you seed data.