import BillFnClient
import Foundation

public enum BillFnStoreKit {
    public static func manageSubscriptionsURL() -> URL {
        URL(string: "https://apps.apple.com/account/subscriptions")!
    }

    public static func makeManageSubscriptionAction() -> BillFnOperationAction {
        BillFnOperationAction(
            type: "manage-subscription",
            url: manageSubscriptionsURL().absoluteString,
            metadata: ["provider": "apple"]
        )
    }
}
