# messaging

Phase 8 (EHR_BUILD_SPEC.md §17 / §26): secure messaging. One resource
(`message_threads`/`messages`), two authenticated-caller shapes — `StaffMessageThreadController`
(`MESSAGE_MANAGE` permission) and `PortalMessageThreadController` (`@SkipAuthz()` +
`@ehr/consent`'s `ConsentService.assertAccess()`) both delegate to the same
`MessageThreadService`.

A staff-authored message notifies every portal account with an active, non-revoked proxy grant for
the patient (self included) via the injected `NotificationGateway` (`@ehr/notification-adapter`).
**A portal-authored message does NOT notify staff in this pass** — no assigned-practitioner/
staff-inbox model exists yet to resolve a real delivery target, so inventing one would be a fake
mechanism rather than a real, if partial, capability. Staff already see new messages via the
thread list itself. Tracked as a documented gap, the same treatment as every other Phase 8 scope
trim.
