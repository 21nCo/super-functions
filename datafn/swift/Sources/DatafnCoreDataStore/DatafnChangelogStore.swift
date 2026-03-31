import CoreData
import Foundation

struct DatafnChangelogStore {
    func append(
        entry: DatafnChangelogPendingEntry,
        metadata: NSManagedObject,
        in context: NSManagedObjectContext
    ) throws -> DatafnChangelogEntry {
        if entry.clientId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DatafnCoreDataStoreError.invalidMutationField("clientId")
        }
        if entry.mutationId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DatafnCoreDataStoreError.invalidMutationField("mutationId")
        }
        if entry.timestampMs < 0 {
            throw DatafnCoreDataStoreError.invalidMutationTimestamp
        }

        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.fetchLimit = 1
        request.predicate = NSPredicate(
            format: "clientID == %@ AND mutationID == %@",
            entry.clientId,
            entry.mutationId
        )

        if let existing = try context.fetch(request).first {
            return try decodeEntry(existing)
        }

        let lastSequence = metadata.value(forKey: "lastChangelogSequence") as? Int64 ?? 0
        let nextSequence = lastSequence + 1

        let object = NSEntityDescription.insertNewObject(forEntityName: entityName, into: context)
        object.setValue(nextSequence, forKey: "sequence")
        object.setValue(entry.clientId, forKey: "clientID")
        object.setValue(entry.mutationId, forKey: "mutationID")
        object.setValue(try encodeJSONObject(entry.mutation), forKey: "mutationData")
        object.setValue(entry.timestampMs, forKey: "timestampMS")
        object.setValue(entry.timestamp, forKey: "timestampISO8601")
        object.setValue(entry.actorId, forKey: "actorID")

        metadata.setValue(nextSequence, forKey: "lastChangelogSequence")

        return DatafnChangelogEntry(
            seq: nextSequence,
            clientId: entry.clientId,
            mutationId: entry.mutationId,
            mutation: entry.mutation,
            timestampMs: entry.timestampMs,
            actorId: entry.actorId,
            timestamp: entry.timestamp
        )
    }

    func list(
        limit: Int,
        in context: NSManagedObjectContext
    ) throws -> [DatafnChangelogEntry] {
        guard limit > 0 else { return [] }
        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.sortDescriptors = [NSSortDescriptor(key: "sequence", ascending: true)]
        request.fetchLimit = limit
        return try context.fetch(request).map(decodeEntry)
    }

    func ack(
        throughSeq: Int64,
        in context: NSManagedObjectContext
    ) throws {
        let request = NSFetchRequest<NSManagedObject>(entityName: entityName)
        request.predicate = NSPredicate(format: "sequence <= %lld", throughSeq)
        try context.fetch(request).forEach(context.delete)
    }

    private func decodeEntry(_ object: NSManagedObject) throws -> DatafnChangelogEntry {
        guard let mutationData = object.value(forKey: "mutationData") as? Data else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        guard
            let clientId = object.value(forKey: "clientID") as? String,
            !clientId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        guard
            let mutationId = object.value(forKey: "mutationID") as? String,
            !mutationId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }
        guard let timestampMs = object.value(forKey: "timestampMS") as? Int64 else {
            throw DatafnCoreDataStoreError.recordDecodingFailed
        }

        return DatafnChangelogEntry(
            seq: object.value(forKey: "sequence") as? Int64 ?? 0,
            clientId: clientId,
            mutationId: mutationId,
            mutation: try decodeJSONObject(from: mutationData),
            timestampMs: timestampMs,
            actorId: object.value(forKey: "actorID") as? String,
            timestamp: object.value(forKey: "timestampISO8601") as? String
        )
    }

    private func decodeJSONObject(from data: Data) throws -> DatafnJSONObject {
        let decoder = JSONDecoder()
        return try decoder.decode(DatafnJSONObject.self, from: data)
    }

    private func encodeJSONObject(_ object: DatafnJSONObject) throws -> Data {
        let encoder = JSONEncoder()
        return try encoder.encode(object)
    }

    private let entityName = "df_changelog_entry"
}
