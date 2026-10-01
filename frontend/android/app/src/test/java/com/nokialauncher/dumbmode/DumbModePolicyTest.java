package com.nokialauncher.dumbmode;

import org.junit.Test;
import java.security.SecureRandom;
import java.util.*;
import static org.junit.Assert.*;

public class DumbModePolicyTest {
    @Test public void detailedCategoriesHaveOneUnknownFallback() {
        assertEquals("photography", DumbModePolicy.group(3));
        assertEquals("maps", DumbModePolicy.group(6));
        assertEquals("productivity", DumbModePolicy.group(7));
        assertEquals("accessibility", DumbModePolicy.group(8));
        assertEquals("unclassified", DumbModePolicy.group(99));
    }
    @Test public void codesContainEveryRequiredClassAndOnlyAscii() {
        SecureRandom random = new SecureRandom();
        Set<String> codes = new HashSet<>();
        for (int i=0; i<2000; i++) {
            String code = DumbModePolicy.generateCode(random);
            assertTrue(code.matches("[A-Za-z0-9]{12}"));
            assertTrue(code.matches(".*[A-Z].*")); assertTrue(code.matches(".*[a-z].*")); assertTrue(code.matches(".*[0-9].*"));
            assertTrue(codes.add(code));
        }
    }
    @Test public void unknownAndAudioAreNotAutomaticallySelected() {
        assertFalse(DumbModePolicy.defaultBlocked(-1)); assertFalse(DumbModePolicy.defaultBlocked(1));
        assertFalse(DumbModePolicy.defaultBlocked(3)); assertEquals("unclassified", DumbModePolicy.group(-1));
        assertEquals("games", DumbModePolicy.group(0)); assertEquals("social", DumbModePolicy.group(4));
    }
    @Test public void reconcilePreservesOptOutButAddsNewDistractorsAndMandatoryGames() {
        Set<String> blocked = new HashSet<>(Arrays.asList("old.blocked"));
        Set<String> seen = new HashSet<>(Arrays.asList("opt.out", "old.blocked", "became.game"));
        Map<String,Integer> current = new HashMap<>();
        current.put("opt.out",4); current.put("old.blocked",1); current.put("became.game",0);
        current.put("new.social",4); current.put("new.news",5); current.put("new.video",2); current.put("new.unknown",-1);
        Set<String> result = DumbModePolicy.reconcile(blocked,seen,current);
        assertTrue(result.containsAll(Arrays.asList("snake","old.blocked","became.game","new.social","new.news","new.video")));
        assertFalse(result.contains("opt.out")); assertFalse(result.contains("new.unknown"));
        assertEquals(Collections.singleton("old.blocked"),blocked);
    }
    @Test public void removalAndReinstallCannotEraseHistory() {
        Set<String> blocked = new HashSet<>(Arrays.asList("removed"));
        Set<String> seen = new HashSet<>(Arrays.asList("removed","optout"));
        Set<String> afterRemoval = DumbModePolicy.reconcile(blocked,seen,Collections.emptyMap());
        Map<String,Integer> reinstalled = new HashMap<>(); reinstalled.put("removed",-1); reinstalled.put("optout",4);
        Set<String> result = DumbModePolicy.reconcile(afterRemoval,seen,reinstalled);
        assertTrue(result.contains("removed")); assertFalse(result.contains("optout"));
    }
}
