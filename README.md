# Signal Polyfill

## ⚠️  This polyfill is a preview of an in-progress proposal and could change at any time. Do not use this in production. ⚠️

A "signal" is [a proposed first-class JavaScript data type](https://github.com/tc39/proposal-signals) that enables one-way data flow through cells of state or computations derived from other state/computations.

This is a polyfill for the `Signal` API.

## Examples

### Using signals

* Use `Signal.State(value)` to create a single "cell" of data that can flow through the unidirectional state graph.
* Use `Signal.Computed(callback)` to define a computation based on state or other computations flowing through the graph.

```js
import { Signal } from "signal-polyfill";
import { effect } from "./effect.js";

const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
const parity = new Signal.Computed(() => isEven.get() ? "even" : "odd");

effect(() => console.log(parity.get())); // Console logs "even" immediately.
setInterval(() => counter.set(counter.get() + 1), 1000); // Changes the counter every 1000ms.

// effect triggers console log "odd"
// effect triggers console log "even"
// effect triggers console log "odd"
// ...
```

The signal proposal does not include an `effect` API, since such APIs are often deeply integrated with rendering and batch strategies that are highly framework/library dependent. However, the proposal does seek to define a set of primitives that library authors can use to implement their own effects.

When working directly with library effect APIs, always be sure to understand the behavior of the `effect` implementation. While the signal algorithm is standardized, effects are not and may vary. To illustrate this, have a look at this code:

```js
counter.get(); // 0
effect(() => counter.set(counter.get() + 1)); // Infinite loop???
counter.get(); // 1
```

Depending on how the effect is implemented, the above code could result in an infinite loop. It's also important to note that running the effect, in this case, causes an immediate invocation of the callback, changing the value of the counter.

### Creating a simple effect

* You can use `Signal.subtle.Watch(callback)` combined with `Signal.Computed(callback)` to create a simple _effect_ implementation.
* The `Signal.subtle.Watch` `callback` is invoked synchronously when a watched signal becomes dirty.
* To batch effect updates, library authors are expected to implement their own schedulers.
* Use `Signal.subtle.Watch#getPending()` to retrieve an array of dirty signals.
* Calling `Signal.subtle.Watch#watch()` with no arguments will re-watch the list of tracked signals again.

```js
import { Signal } from "signal-polyfill";

let needsEnqueue = true;

const w = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask(processPending);
  }
});

function processPending() {
  needsEnqueue = true;
    
  for (const s of w.getPending()) {
    s.get();
  }

  w.watch();
}

export function effect(callback) {
  let cleanup;
  
  const computed = new Signal.Computed(() => {
    typeof cleanup === "function" && cleanup();
    cleanup = callback();
  });
  
  w.watch(computed);
  computed.get();
  
  return () => {
    w.unwatch(computed);
    typeof cleanup === "function" && cleanup();
    cleanup = undefined;
  };
}
```

> [!IMPORTANT]
> The `Signal.subtle` APIs are so named in order to communicate that their correct use requires careful attention to detail. These APIs are not targeted at application-level code, but rather at framework/library authors.

### Combining signals and decorators

A class accessor decorator can be combined with the `Signal.State()` API to enable improved DX.

```js
import { Signal } from "signal-polyfill";

export function signal(target) {
  const { get } = target;

  return {
    get() {
      return get.call(this).get();
    },

    set(value) {
      get.call(this).set(value);
    },
    
    init(value) {
      return new Signal.State(value);
    },
  };
}
```

The above decorator can be used on public or **private** accessors, enabling reactivity while carefully controlling state mutations.

```js
export class Counter {
  @signal accessor #value = 0;

  get value() {
    return this.#value;
  }

  increment() {
    this.#value++;
  }

  decrement() {
    if (this.#value > 0) {
      this.#value--;
    }
  }
}
```
### Practical testing example

This test simulates a user authentication interface, which demonstrates on practice Signal's computations, effects, how it manages state and triggers actions based on their changes:

```js
describe("Detailed Reactive System with Signal", () => {
  it("correctly manages state and triggers effects in a detailed scenario", () => {
    // Create signals with initial values
    const nameSignal = new Signal.State("Fu");
    const ageSignal = new Signal.State(30);
    const loggedInSignal = new Signal.State(false);
    const isAdminSignal = new Signal.State(false);
    const notificationCountSignal = new Signal.State(0);

    // Create computed values that depend on signals
    const formattedName = new Signal.Computed(
      () => `User: ${nameSignal.get()}`
    );
    const formattedAge = new Signal.Computed(() => `Age: ${ageSignal.get()}`);
    const userStatus = new Signal.Computed(() => {
      if (loggedInSignal.get()) {
        if (isAdminSignal.get()) {
          return "Admin";
        } else {
          return "User";
        }
      } else {
        return "Guest";
      }
    });
    const notificationMessage = new Signal.Computed(() => {
      const notificationCount = notificationCountSignal.get();
      if (notificationCount === 0) {
        return "No new notifications";
      } else if (notificationCount === 1) {
        return "1 new notification";
      } else {
        return `${notificationCount} new notifications`;
      }
    });

    // Effect functions to simulate displaying formatted values
    const displayFormattedName = () => {
      return formattedName.get();
    };

    const displayFormattedAge = () => {
      return formattedAge.get();
    };

    const displayUserStatus = () => {
      return userStatus.get();
    };

    const displayNotificationMessage = () => {
      return notificationMessage.get();
    };

    // Arrays to store logs
    let userStatusLogs = [];
    let notificationLogs = [];

    // Effect functions to simulate side effects
    const logUserStatusChange = () => {
      userStatusLogs.push(`User status changed: ${displayUserStatus()}`);
    };

    const showNotification = () => {
      notificationLogs.push(`Notification: ${displayNotificationMessage()}`);
    };

    // Initial assertions
    expect(displayFormattedName()).toBe("User: Fu");
    expect(displayFormattedAge()).toBe("Age: 30");
    expect(displayUserStatus()).toBe("Guest");
    expect(displayNotificationMessage()).toBe("No new notifications");

    // Change signals' values
    nameSignal.set("Bar");
    ageSignal.set(35);
    loggedInSignal.set(true);

    // Expect effects to reflect the new values
    expect(displayFormattedName()).toBe("User: Bar");
    expect(displayFormattedAge()).toBe("Age: 35");
    expect(displayUserStatus()).toBe("User");

    // Log user status change
    logUserStatusChange();

    // Check logs
    console.log(userStatusLogs); // Logs the contents of userStatusLogs

    // Simulate user becoming an admin
    isAdminSignal.set(true);

    // Expect user status to change to 'Admin'
    expect(displayUserStatus()).toBe("Admin");

    // Log user status change again
    logUserStatusChange();

    // Check logs again
    console.log(userStatusLogs); // Logs the contents of userStatusLogs

    // Simulate receiving notifications
    notificationCountSignal.set(3);

    // Show notifications
    showNotification();

    // Check notification logs
    console.log(notificationLogs); // Logs the contents of notificationLogs
  });
});
```




## Contributing

- clone the repo, `git clone git@github.com:proposal-signals/signal-polyfill.git`
- `cd signal-polyfill`
- use your favorite package manager to install dependencies, e.g.: `pnpm install`, `npm install`, `yarn install`, etc
- make your change
- add and run tests
- open a PR
- collaborate 🥳
