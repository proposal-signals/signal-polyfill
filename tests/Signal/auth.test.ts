import { describe, expect, it } from "vitest";
import { Signal } from "../../src/wrapper.js";

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
    expect(userStatusLogs).toEqual(["User status changed: User"]);

    // Simulate user becoming an admin
    isAdminSignal.set(true);

    // Expect user status to change to 'Admin'
    expect(displayUserStatus()).toBe("Admin");

    // Log user status change again
    logUserStatusChange();

    // Check logs again
    expect(userStatusLogs).toEqual([
      "User status changed: User",
      "User status changed: Admin",
    ]);

    // Simulate receiving notifications
    notificationCountSignal.set(3);

    // Show notifications
    showNotification();

    // Check notification logs
    expect(notificationLogs).toEqual(["Notification: 3 new notifications"]);
  });
});
