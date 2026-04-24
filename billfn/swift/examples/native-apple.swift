import BillFnClient
import BillFnStoreKit
import Foundation

let client = BillFnClient(
    configuration: BillFnClientConfiguration(
        baseURL: URL(string: "https://billfn.example.test/billfn/")!
    )
)

let manageAction = BillFnStoreKit.makeManageSubscriptionAction()
print("Open Apple-managed subscriptions at:", manageAction.url ?? "")

let restoreRequest = try client.makeRequest(path: "purchases/restore", method: "POST")
print("Restore request:", restoreRequest)
