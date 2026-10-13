package com.capacitorjs.plugins.localnotifications
import org.junit.Test
import org.junit.Assert.*
class CfhRestorePolicyTest {
 @Test fun nearestRemindersFirst(){
  val shuffled=listOf(900000L,9000L,200000L,4000L)
  assertEquals(listOf(4000L,9000L,200000L,900000L),shuffled.sortedBy { CfhRestorePolicy.priority(it) })
  assertTrue(CfhRestorePolicy.priority(null)>CfhRestorePolicy.priority(900000))
 }
 @Test fun cancelledAndPastOneShotsNeverResurrect(){
  assertFalse(CfhRestorePolicy.eligible(true,false,2000,1000))
  assertFalse(CfhRestorePolicy.eligible(false,false,1000,1000))
  assertFalse(CfhRestorePolicy.eligible(false,false,900,1000))
  assertTrue(CfhRestorePolicy.eligible(false,false,2000,1000))
  assertTrue(CfhRestorePolicy.eligible(false,true,900,1000))
 }
}
