import Foundation
import Capacitor
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "NativeHealthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlatform", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMeasurements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSystemHealthSettings", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = HKHealthStore.isHealthDataAvailable()
        call.resolve([
            "available": available,
            "platform": "ios"
        ])
    }

    @objc func getPlatform(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "ios",
            "isNative": true
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit недоступен на этом устройстве")
            return
        }

        var readTypes = Set<HKObjectType>()
        if let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            readTypes.insert(bodyMass)
        }
        if let bodyFat = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage) {
            readTypes.insert(bodyFat)
        }
        if let leanMass = HKQuantityType.quantityType(forIdentifier: .leanBodyMass) {
            readTypes.insert(leanMass)
        }

        // Least Privilege: toShare is nil (Read-Only access)
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { (success, error) in
            if let error = error {
                call.reject("Ошибка авторизации HealthKit: \(error.localizedDescription)")
                return
            }
            call.resolve([
                "granted": success,
                "types": ["weight", "body_fat_percentage", "lean_body_mass"]
            ])
        }
    }

    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([
                "status": "unsupported",
                "types": []
            ])
            return
        }
        call.resolve([
            "status": "authorized",
            "availableTypes": ["weight", "body_fat_percentage", "lean_body_mass"]
        ])
    }

    @objc func readMeasurements(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit недоступен")
            return
        }

        let limit = call.getInt("limit") ?? 500
        let sinceDays = call.getInt("sinceDays") ?? 90

        var startDate: Date
        if let sinceStr = call.getString("since"), let parsed = isoFormatter.date(from: sinceStr) {
            startDate = parsed
        } else {
            startDate = Calendar.current.date(byAdding: .day, value: -sinceDays, to: Date()) ?? Date().addingTimeInterval(-90*86400)
        }

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        var queryTypes: [(HKQuantityType, String, HKUnit)] = []
        if let mass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            queryTypes.append((mass, "weight", HKUnit.gramUnit(with: .kilo)))
        }
        if let fat = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage) {
            queryTypes.append((fat, "body_fat_percentage", HKUnit.percent()))
        }
        if let lean = HKQuantityType.quantityType(forIdentifier: .leanBodyMass) {
            queryTypes.append((lean, "lean_body_mass", HKUnit.gramUnit(with: .kilo)))
        }

        let dispatchGroup = DispatchGroup()
        var collectedRecords: [[String: Any]] = []
        let lock = NSLock()

        for (qType, metricKey, targetUnit) in queryTypes {
            dispatchGroup.enter()

            let query = HKSampleQuery(sampleType: qType, predicate: predicate, limit: limit, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
                defer { dispatchGroup.leave() }

                guard let quantitySamples = samples as? [HKQuantitySample], error == nil else {
                    return
                }

                var batch: [[String: Any]] = []
                for sample in quantitySamples {
                    var val = sample.quantity.doubleValue(for: targetUnit)
                    var unitStr = "kg"
                    if metricKey == "body_fat_percentage" {
                        val = val * 100.0 // HealthKit stores percentage as 0.0 .. 1.0 ratio
                        unitStr = "%"
                    }

                    var recordDict: [String: Any] = [
                        "sourceRecordId": sample.uuid.uuidString,
                        "metricType": metricKey,
                        "value": val,
                        "unit": unitStr,
                        "measuredAt": self.isoFormatter.string(from: sample.startDate),
                        "originPlatform": "ios"
                    ]

                    let source = sample.sourceRevision.source
                    recordDict["sourceApp"] = source.bundleIdentifier
                    recordDict["sourceName"] = source.name

                    if let device = sample.device {
                        var devName = device.name ?? device.model
                        if let model = device.model, devName == nil {
                            devName = model
                        }
                        recordDict["sourceDevice"] = devName
                        recordDict["deviceManufacturer"] = device.manufacturer
                        recordDict["deviceModel"] = device.model
                    }

                    batch.append(recordDict)
                }

                lock.lock()
                collectedRecords.append(contentsOf: batch)
                lock.unlock()
            }

            self.healthStore.execute(query)
        }

        dispatchGroup.notify(queue: .main) {
            call.resolve([
                "records": collectedRecords,
                "count": collectedRecords.count,
                "syncCursor": self.isoFormatter.string(from: Date())
            ])
        }
    }

    @objc func openSystemHealthSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                call.resolve(["opened": true])
            } else {
                call.reject("Не удалось открыть настройки")
            }
        }
    }
}
