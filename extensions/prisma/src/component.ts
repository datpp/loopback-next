// Copyright IBM Corp. 2021. All Rights Reserved.
// Node module: @loopback/prisma
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  Application,
  Binding,
  BindingCreationPolicy,
  BindingScope,
  BindingType,
  Component,
  config,
  configBindingKeyFor,
  ContextTags,
  ContextView,
  CoreBindings,
  extensionFilter,
  extensionPoint,
  extensions,
  inject,
  LifeCycleObserver,
  lifeCycleObserver,
} from '@loopback/core';
import {Prisma, PrismaClient} from '@prisma/client';
import {PrismaClientNotSingletonError} from './errors/';
import {createBindingFromPrismaModelName} from './helpers/';
import {PrismaBindings} from './keys';
import {DEFAULT_PRISMA_OPTIONS, PrismaOptions} from './types';

const componentConfigBindingKey = configBindingKeyFor<PrismaOptions>(
  PrismaBindings.COMPONENT,
);

/**
 * The component used to register the necessary artifacts for Prisma integration
 * with LoopBack 4.
 *
 * @remarks
 * This component was designed to be registered with
 * {@link Application.component} or used standalone—This is to enable more
 * complex use-cases and easier testing.
 *
 * Check the {@link PrismaComponent:constructor} tsdoc for in-depth
 * documentation on instances.
 *
 * @decorator
 * ```typescript
 * @lifeCycleObserver('datasource', {
 *   tags: {[ContextTags.KEY]: PrismaBindings.COMPONENT},
 *   scope: BindingScope.SINGLETON,
 * })
 * @extensionPoint(PRISMA_CLIENT_MIDDLEWARE_EXTENSION_POINT)
 * ```
 */
@lifeCycleObserver('datasource', {
  tags: {[ContextTags.KEY]: PrismaBindings.COMPONENT},
  scope: BindingScope.SINGLETON,
})
@extensionPoint(PrismaBindings.PRISMA_MIDDLEWARE_EXTENSION_POINT)
export class PrismaComponent implements Component, LifeCycleObserver {
  @inject.binding(componentConfigBindingKey, {
    bindingCreation: BindingCreationPolicy.CREATE_IF_NOT_BOUND,
  })
  private _optionsBinding: Binding<PrismaOptions>;
  @extensions.view()
  private _prismaMiddleware: ContextView<Prisma.Middleware>;
  private _isInitialized = false;

  /**
   * Returns `true` if {@link PrismaComponent.init} has been called.
   *
   * @remarks
   * This is useful for ensuring that {@link PrismaComponent.init} is called
   * exactly once outside of {@link @loopback/core#LifeCycleObserverRegistry}
   * (e.g. as a prerequisite before calling {@link PrismaComponent.start}).
   */
  get isInitialized() {
    return this._isInitialized;
  }

  /**
   * @remarks
   * ## Providing custom PrismaClient
   * It is possible to provide a custom PrismaClient instance by either:
   *
   * - Providing a {@link @prisma/client#PrismaClient} instance into the
   *     constructor.
   * - Binding a {@link @prisma/client#PrismaClient} instance to
   *     {@link PrismaBindings.PRISMA_CLIENT_INSTANCE} before
   *     {@link PrismaComponent.init}.
   *
   * If a {@link @prisma/client#PrismaClient} instance is provided through the
   * constructor but not bound to context, a new binding will be created for
   * that instance.
   *
   * Note that if a {@link @prisma/client#PrismaClient} instance is provided
   * through both aforementioned methods, they must reference the same instance.
   * Otherwise, an error will be thrown when {@link PrismaComponent:constructor}
   * or {@link PrismaComponent.start} is called.
   *
   * ## Post-initialization restrictions
   * After `init()` is successfully called, the following scenarios will throw
   * an error:
   *
   * - Calling {@link PrismaComponent.init} again.
   *
   * Furthermore, the following scenarios will not be ignored by the component:
   *
   * - Manipulating {@link PrismaBindings.COMPONENT} configuration binding.
   * - Manipulating {@link PrismaBindings.PRISMA_CLIENT_INSTANCE} binding.
   * - Manipulating existing
   *     {@link PrismaBindings.PRISMA_MIDDLEWARE_EXTENSION_POINT} extension
   *     point bindings
   *
   * Furthermore, the following bindings will be locked:
   *
   * - Configuration binding key of {@link PrismaBindings.COMPONENT}
   * - {@link PrismaBindings.PRISMA_CLIENT_INSTANCE}
   *
   * These restrictions are in place as {@link @prisma/client#PrismaClient}
   * would have already been initialized.
   *
   * ## De-initialization
   * To de-initialize, replace the current instance with a new instance.
   *
   * @param _app An instance of a generic or specialized
   * {@link @loopback/core#Application}.
   * @param _prismaClient An instance of {@link @prisma/client#PrismaClient}.
   * @param _options Initial component and {@link @prisma/client#PrismaClient}
   * configuration.
   */
  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE)
    private _app: Application,
    @inject(PrismaBindings.PRISMA_CLIENT_INSTANCE, {optional: true})
    private _prismaClient?: PrismaClient,
    @config()
    private _options: PrismaOptions = DEFAULT_PRISMA_OPTIONS,
  ) {
    PrismaComponent._ensureNoConflictingPrismaProvidedAndBound(
      this._app,
      this._prismaClient,
    );

    // Necessary for standalone usage as the component is never bound to
    // context to allow the extension point view to resolve.
    this._prismaMiddleware ??= this._app.createView(
      extensionFilter(PrismaBindings.PRISMA_MIDDLEWARE_EXTENSION_POINT),
    );

    // Backlog and future middleware binding locking.
    for (const binding of this._prismaMiddleware.bindings) binding.lock();
    this._prismaMiddleware.on('bind', function ({binding}) {
      binding.lock();
    });

    // A workaround as BindingCreationPolicy.CREATE_IF_NOT_BOUND does not
    // return a binding.
    // It also creates a new binding if the binding creation policy was not
    // honored (i.e. Standalone usage).
    this._optionsBinding ??=
      this._app.getBinding(componentConfigBindingKey, {
        optional: true,
      }) ?? this._app.bind(componentConfigBindingKey);

    // Deep augment defaults for any unset options.
    if (this._options.models) {
      this._options.models.namespace ??= DEFAULT_PRISMA_OPTIONS.models!.namespace;
      this._options.models.tags ??= DEFAULT_PRISMA_OPTIONS.models!.tags;
    }

    if (!this._optionsBinding.type) {
      // Binds the options from constructor if there's non bound.
      // This happens if:
      // - The component is used standalone
      // - No configuration was bound before component initialization.
      this._app.bind(componentConfigBindingKey).to(this._options);
    }
  }

  /**
   * Checks if a conflicting instance of Prisma is provided in the constructor
   * and bound to context.
   *
   * @returns `undefined` if the {@link @prisma/client#PrismaClient} instance
   * referenced in the constructor and binding are identical.
   */
  private static _ensureNoConflictingPrismaProvidedAndBound(
    application: Application,
    prismaClient?: PrismaClient,
  ) {
    if (
      prismaClient &&
      prismaClient !==
        (application.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE, {
          optional: true,
        }) ?? prismaClient)
    ) {
      throw new Error(
        'A Prisma Client instance was provided whilst a different instance was bound to context.',
      );
    }
  }

  private static _ensureValidPrismaClientBinding(
    prismaClient: PrismaClient,
    application: Application,
  ) {
    const prismaClientBinding = application.getBinding(
      PrismaBindings.PRISMA_CLIENT_INSTANCE,
      {optional: true},
    );

    if (!prismaClientBinding)
      application
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(prismaClient)
        .inScope(BindingScope.SINGLETON);
    else if (prismaClientBinding.scope !== BindingScope.SINGLETON)
      throw new PrismaClientNotSingletonError();
    else if (prismaClientBinding.type !== BindingType.CONSTANT) {
      throw new Error('Prisma Client instance binding type not constant.');
    }
  }

  /**
   * Initializes PrismaClient, if needed.
   *
   * @remarks
   * Calling this function will lock PrismaClient and configuration.
   *
   * If the component instance is already initialized, this function will be a
   * no-op.
   */
  async init() {
    if (this._isInitialized) return;

    PrismaComponent._ensureNoConflictingPrismaProvidedAndBound(
      this._app,
      this._prismaClient,
    );

    if (this._prismaClient) {
      PrismaComponent._ensureValidPrismaClientBinding(
        this._prismaClient,
        this._app,
      );
    } else {
      // Late refresh of Prisma options cache.
      this._options = await this._app.get(componentConfigBindingKey);

      const {prismaClient: prismaOptions} = this._options;
      this._prismaClient = new PrismaClient(prismaOptions);
      this._app
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(this._prismaClient)
        .inScope(BindingScope.SINGLETON);
    }

    const prismaClientBinding = this._app.getBinding(
      PrismaBindings.PRISMA_CLIENT_INSTANCE,
    );

    // Lock the these bindings as changes after initialization are not
    // supported.
    this._optionsBinding.lock();
    prismaClientBinding.lock();

    // Initiate middleware backlog and future registration
    const prismaMiddlewares = await this._prismaMiddleware.values();
    for (const middleware of prismaMiddlewares)
      this._prismaClient!.$use(middleware);

    this._prismaMiddleware.on('bind', ({binding, context}) => {
      if (
        binding.type !== BindingType.CONSTANT ||
        binding.scope !== BindingScope.SINGLETON
      ) {
        throw new Error(
          'Prisma middleware is not bound as singleton and/or constant.',
        );
      }

      const prismaClient = context.getSync(
        PrismaBindings.PRISMA_CLIENT_INSTANCE,
      );
      prismaClient.$use(context.getSync(binding.key));
    });

    // Bind models
    for (const modelName in Prisma.ModelName) {
      this._app.add(
        createBindingFromPrismaModelName(
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this._prismaClient[modelName.toLowerCase()],
          modelName,
        ).lock(),
      );
    }

    this._isInitialized = true;
  }

  /**
   * Start Prisma datasource connections, if needed.
   *
   * @remarks
   * If {@link PrismaComponent.init} hasn't been caled, it will be called
   * implicitly.
   *
   * If {@link PrismaOptions.lazyConnect} is `true`,
   * {@link @prisma/client#PrismaClient.$connect} is called. Otherwise, this is
   * a no-op function.
   *
   * @returns `undefined` if {@link PrismaOptions.lazyConnect} is `true`, else
   * {@link @prisma/client#PrismaClient.$connect} promise.
   */
  async start() {
    if (!this._isInitialized) await this.init();
    if (this._options.lazyConnect) return;
    return this._prismaClient!.$connect();
  }

  /**
   * Stops Prisma datasource connections.
   *
   * @remarks
   * If {@link PrismaComponent.init} hasn't been called, this will be a no-op
   * function.
   *
   * @returns return value from {@link @prisma/client#PrismaClient.$disconnect}.
   */
  stop() {
    if (!this._isInitialized) return;
    return this._prismaClient!.$disconnect();
  }
}
