# @loopback/prisma

This package enables Prisma integration with LoopBack 4.

## Installation

To install `@loopback/prisma`:

```sh
$ [npm install | yarn add] @loopback/prisma
```

## Integration Scope

This package adds the following integration capabilities:

- Binding of Prisma models to context
- Connection lifecycle integration

The following are not supported yet, but are being considered:

- OpenAPI 3.0 schema generation
- Converting LoopBack 4 filters into Prisma queries
- Converting Prisma-style queries into LoopBack 4 filters
- Integration with `@loopback/logging`
- Integration with `@loopback/metrics` (blocked by
  https://github.com/prisma/prisma/issues/5129)

The following are not supported, and are not being considered:

- Use of LoopBack 4 models/repository/datastore with Prisma DSL

## Considerations

When using Prisma integration for LoopBack 4, there may be some important
factors or changes that should be considered:

- `lazyConnect` is disabled by default.

  This is to ensure that LoopBack fails fast with database connection issues.

- Limited support for architectures or operating systems

  The Prisma engines are binary blobs that has its own list of supported
  platforms, separate from Node.js itself.

## Basic Use

Configure and load LoopbackPrismaComponent in the application constructor as
shown below.

```ts
import {PrismaComponent, PrismaOptions} from '@loopback/prisma';

export class MyApplication extends RepositoryMixin(
  Application // This can be replaced with `RestApplication` if needed.
)) {
  constructor(options: ApplicationConfig = {}) {
    const opts: PrismaOptions = {/* Config here */}

    this.configure(PrismaBindings.COMPONENT).to(opts);
    this.component(PrismaComponent);
  }
}
```

### Configuring Prisma Client and Component

The Prisma Component and Prisma Client accepts custom configuration, which can
be configured as follows:

```typescript
import {PrismaBindings, PrismaComponent, PrismaOptions} from '@loopback/prisma';

export class MyApplication extends RepositoryMixin(RestApplication)) {
  constructor(options: ApplicationConfig = {}) {
    const opts: PrismaOptions = {
      prismaClient: {
        /* Prisma Client options go here */
      }

      // Prisma Component configuration
      lazyConnect: false
      models: {
        namespace: 'customPrismaModelNamespace',
        tags: ['customPrismaModelTag'],
      }
    }

    // The order does not matter as long as `app.init()` hasn't been called.
    this.configure(PrismaBindings.COMPONENT).to(opts);
    this.component(PrismaComponent);
    // ...
  }
}
```

After `.init()`, the configuration binding will be locked. Manual unlocking and
modification will not be honored.

### Registering Prisma middleware

Extension points are a LoopBack 4 concept which allows extending functionality
through a common interface. In the case, it is also useful as a bill-of-material
of registered Prisma middleware.

```typescript
import {Binding, BindingKey} from '@loopback/core';
import {
  asPrismaMiddleware,
  PrismaBindings,
  PrismaComponent
} from '@loopback/prisma';

// Replace this to import your own middleware.
import {myPrismaMiddleware} from '.';

export class MyApplication extends RepositoryMixin(RestApplication)) {
  constructor(options: ApplicationConfig = {}) {
    // BindingKey.generate() creates a unique binding key.
    // It can be replaced with your own binding key to allow identification of
    // the middleware.
    this.bind(new Binding(BindingKey.generate()))
      .to(myPrismaMiddleware)
      .apply(asPrismaMiddleware);

    this.component(LoopbackPrismaComponent);
    // ...
  }
}
```

Prisma middleware can be registered at any point in time (with some caveats),
and its binding will be automatically locked immediately when and after
`.init()`.

#### Registering Prisma Middleware after init

After `.init()` is called, it is necessary to call `process.nextTick()` to
guarantee that the middleware registation is complete. Otherwise, there is a
risk of a race condition.

In asynchronous functions, it is possible to adapt `process.nextTick()` as
follows:

```typescript
// Avoid "callback hell" in asynchronous functions
await new Promise(resolve => process.nextTick(resolve));
```

## Advanced Use

### Custom Prisma Client instance

Before `.init()` is called, it is possible to provide a custom instance of the
Prisma Client:

```typescript
import {PrismaBindings, PrismaComponent} from '@loopback/prisma';
import {PrismaClient} from '@prisma/client';

export class MyApplication extends RepositoryMixin(RestApplication)) {
  constructor(options: ApplicationConfig = {}) {
    const prismaClient = new PrismaClient();

    this.bind(PrismaBindings.PRISMA_CLIENT_INSTANCE).to(prismaClient);
    this.component(LoopbackPrismaComponent);
    // ...
  }
}
```

In most cases, it's usually not necessary to provide your own instance of the
Prisma Client. Also note that the instance MUST be bound as a constant (i.e.
using `Binding.to()`); Otherwise, an error will be thrown during `.init()` and
`.start()`.

### Pre- & Post-initialization Restrictions

Before `.init()` is called, the configuration and Prisma Client instance binding
can be modified, and it is not necessary to call `.configure()` before
`.component()`.

After initialization, both bindings will be locked and any changes (even after
manual unlocking) will not be honored.
