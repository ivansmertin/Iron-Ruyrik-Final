package ru.ironryrik.app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

@CapacitorPlugin(name = "NativeHealthBridge")
class HealthConnectPlugin : Plugin() {

    private val permissions = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class)
    )

    private val healthConnectClient: HealthConnectClient? by lazy {
        val ctx = context ?: return@lazy null
        if (HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(ctx)
        } else {
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ctx = context
        if (ctx == null) {
            val ret = JSObject()
            ret.put("available", false)
            ret.put("platform", "android")
            call.resolve(ret)
            return
        }

        val status = HealthConnectClient.getSdkStatus(ctx)
        val ret = JSObject()
        ret.put("platform", "android")

        when (status) {
            HealthConnectClient.SDK_AVAILABLE -> {
                ret.put("available", true)
                ret.put("providerPackage", HealthConnectClient.DEFAULT_PROVIDER_PACKAGE_NAME)
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                ret.put("available", false)
                ret.put("updateRequired", true)
                ret.put("providerPackage", HealthConnectClient.DEFAULT_PROVIDER_PACKAGE_NAME)
            }
            else -> {
                ret.put("available", false)
                ret.put("updateRequired", false)
            }
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun getPlatform(call: PluginCall) {
        val ret = JSObject()
        ret.put("platform", "android")
        ret.put("isNative", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getPermissionStatus(call: PluginCall) {
        val client = healthConnectClient
        if (client == null) {
            val ret = JSObject()
            ret.put("status", "unsupported")
            ret.put("availableTypes", JSArray())
            call.resolve(ret)
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val availableTypes = JSArray()
                if (granted.contains(HealthPermission.getReadPermission(WeightRecord::class))) {
                    availableTypes.put("weight")
                }
                if (granted.contains(HealthPermission.getReadPermission(BodyFatRecord::class))) {
                    availableTypes.put("body_fat_percentage")
                }
                if (granted.contains(HealthPermission.getReadPermission(LeanBodyMassRecord::class))) {
                    availableTypes.put("lean_body_mass")
                }

                val status = when {
                    granted.containsAll(permissions) -> "authorized"
                    availableTypes.length() > 0 -> "partially_authorized"
                    else -> "not_determined"
                }

                val ret = JSObject()
                ret.put("status", status)
                ret.put("availableTypes", availableTypes)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Ошибка получения статуса разрешений: ${e.localizedMessage}")
            }
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val ctx = context
        if (ctx == null || HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect недоступен или требует установки на этом устройстве")
            return
        }

        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(ctx, permissions)
            startActivityForResult(call, intent, "permissionsCallback")
        } catch (e: Exception) {
            call.reject("Не удалось запросить разрешения Health Connect: ${e.localizedMessage}")
        }
    }

    @ActivityCallback
    private fun permissionsCallback(call: PluginCall, result: ActivityResult) {
        val client = healthConnectClient
        if (client == null) {
            call.reject("Health Connect недоступен")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val typesArr = JSArray()
                if (granted.contains(HealthPermission.getReadPermission(WeightRecord::class))) {
                    typesArr.put("weight")
                }
                if (granted.contains(HealthPermission.getReadPermission(BodyFatRecord::class))) {
                    typesArr.put("body_fat_percentage")
                }
                if (granted.contains(HealthPermission.getReadPermission(LeanBodyMassRecord::class))) {
                    typesArr.put("lean_body_mass")
                }

                val ret = JSObject()
                ret.put("granted", granted.containsAll(permissions))
                ret.put("types", typesArr)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Ошибка при проверке разрешений: ${e.localizedMessage}")
            }
        }
    }

    @PluginMethod
    fun readMeasurements(call: PluginCall) {
        val client = healthConnectClient
        if (client == null) {
            call.reject("Health Connect недоступен")
            return
        }

        val limit = call.getInt("limit") ?: 500
        val sinceDays = call.getInt("sinceDays") ?: 90
        val sinceStr = call.getString("since")

        val startTime = if (sinceStr != null) {
            try {
                Instant.parse(sinceStr)
            } catch (e: Exception) {
                Instant.now().minus(sinceDays.toLong(), ChronoUnit.DAYS)
            }
        } else {
            Instant.now().minus(sinceDays.toLong(), ChronoUnit.DAYS)
        }
        val endTime = Instant.now()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val recordsArray = JSArray()
                val granted = client.permissionController.getGrantedPermissions()

                // 1. Weight Records
                if (granted.contains(HealthPermission.getReadPermission(WeightRecord::class))) {
                    val weightRequest = ReadRecordsRequest(
                        recordType = WeightRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                        pageSize = limit
                    )
                    val weightResponse = client.readRecords(weightRequest)
                    for (record in weightResponse.records) {
                        val obj = JSObject()
                        obj.put("sourceRecordId", record.metadata.id)
                        obj.put("metricType", "weight")
                        obj.put("value", record.weight.inKilograms)
                        obj.put("unit", "kg")
                        obj.put("measuredAt", record.time.toString())
                        obj.put("originPlatform", "android")
                        obj.put("sourceApp", record.metadata.dataOrigin.packageName)
                        obj.put("sourceName", record.metadata.dataOrigin.packageName)
                        record.metadata.device?.let { dev ->
                            obj.put("sourceDevice", dev.model ?: dev.manufacturer)
                            obj.put("deviceManufacturer", dev.manufacturer)
                            obj.put("deviceModel", dev.model)
                        }
                        recordsArray.put(obj)
                    }
                }

                // 2. Body Fat Records
                if (granted.contains(HealthPermission.getReadPermission(BodyFatRecord::class))) {
                    val bodyFatRequest = ReadRecordsRequest(
                        recordType = BodyFatRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                        pageSize = limit
                    )
                    val bodyFatResponse = client.readRecords(bodyFatRequest)
                    for (record in bodyFatResponse.records) {
                        val obj = JSObject()
                        obj.put("sourceRecordId", record.metadata.id)
                        obj.put("metricType", "body_fat_percentage")
                        obj.put("value", record.percentage.value)
                        obj.put("unit", "%")
                        obj.put("measuredAt", record.time.toString())
                        obj.put("originPlatform", "android")
                        obj.put("sourceApp", record.metadata.dataOrigin.packageName)
                        obj.put("sourceName", record.metadata.dataOrigin.packageName)
                        record.metadata.device?.let { dev ->
                            obj.put("sourceDevice", dev.model ?: dev.manufacturer)
                            obj.put("deviceManufacturer", dev.manufacturer)
                            obj.put("deviceModel", dev.model)
                        }
                        recordsArray.put(obj)
                    }
                }

                // 3. Lean Body Mass Records
                if (granted.contains(HealthPermission.getReadPermission(LeanBodyMassRecord::class))) {
                    val leanRequest = ReadRecordsRequest(
                        recordType = LeanBodyMassRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                        pageSize = limit
                    )
                    val leanResponse = client.readRecords(leanRequest)
                    for (record in leanResponse.records) {
                        val obj = JSObject()
                        obj.put("sourceRecordId", record.metadata.id)
                        obj.put("metricType", "lean_body_mass")
                        obj.put("value", record.mass.inKilograms)
                        obj.put("unit", "kg")
                        obj.put("measuredAt", record.time.toString())
                        obj.put("originPlatform", "android")
                        obj.put("sourceApp", record.metadata.dataOrigin.packageName)
                        obj.put("sourceName", record.metadata.dataOrigin.packageName)
                        record.metadata.device?.let { dev ->
                            obj.put("sourceDevice", dev.model ?: dev.manufacturer)
                            obj.put("deviceManufacturer", dev.manufacturer)
                            obj.put("deviceModel", dev.model)
                        }
                        recordsArray.put(obj)
                    }
                }

                val ret = JSObject()
                ret.put("records", recordsArray)
                ret.put("count", recordsArray.length())
                ret.put("syncCursor", Instant.now().toString())
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Ошибка при чтении данных Health Connect: ${e.localizedMessage}")
            }
        }
    }

    @PluginMethod
    fun openSystemHealthSettings(call: PluginCall) {
        val ctx = context
        if (ctx == null) {
            call.reject("Контекст недоступен")
            return
        }

        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            val ret = JSObject()
            ret.put("opened", true)
            call.resolve(ret)
        } catch (e: Exception) {
            try {
                // Fallback to app details settings
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", ctx.packageName, null)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
                val ret = JSObject()
                ret.put("opened", true)
                call.resolve(ret)
            } catch (e2: Exception) {
                call.reject("Не удалось открыть настройки: ${e2.localizedMessage}")
            }
        }
    }
}
