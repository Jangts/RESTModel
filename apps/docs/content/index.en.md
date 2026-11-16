---
layout: home
hero:
  name: RESTModel
  text: Organize APIs as resources.
  tagline: Declare capabilities, connect resources and express requests through fluent calls.
  image:
    src: /branding/restmodel-logo.svg
    alt: RESTModel
  actions:
    - theme: brand
      text: Get started
      link: /en/guide/getting-started
    - theme: alt
      text: Explore the API
      link: /en/api/restmodel
features:
  - title: Start with resources
    details: Declare collections, members, singletons and relations that follow your domain.
  - title: Declare capabilities
    details: Operation allowlists, reusable presets and actions make permitted calls explicit.
  - title: Adapt service conventions
    details: Reuse schemes for identity, response envelopes and pagination across resources.
  - title: Compose transports
    details: Built-in Fetch with optional Axios, HTTP Mock and Pinia keeps the core independent.
---

## Declare once, call naturally

```ts
import { createClient, resource } from '@restmodel/restmodel';
const api = createClient({
  baseURL: 'https://example.test/api',
  resources: { users: resource({ operations: ['list', 'get', 'patch'] }) },
});
const users = await api.users.page(1, 20).list();
const user = await api.users(0).get();
await api.users(0).patch({ name: 'Ivan' });
```

This example requires a real REST service. The main package and extensions target public distribution; use workspace builds or local tarballs until publication. [Getting started](/en/guide/getting-started) shows how to connect a real REST service.
