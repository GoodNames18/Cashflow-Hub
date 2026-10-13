package com.capacitorjs.plugins.localnotifications
internal object CfhRestorePolicy {
 fun eligible(cancelled: Boolean, perpetual: Boolean, at: Long?, now: Long): Boolean =
  !cancelled && (perpetual || at == null || at > now)
 fun priority(at: Long?): Long = at ?: Long.MAX_VALUE
}
