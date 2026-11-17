package com.lightningmcqueen.driver;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PointsTest {

    @Test
    public void formatsPointsWithThousandsSeparators() {
        assertEquals("6,400 pts", Points.format(6400));
        assertEquals("0 pts", Points.format(0));
        assertEquals("+150 pts", Points.signed(150));
        assertEquals("-30 pts", Points.signed(-30));
    }

    @Test
    public void formatsDollars() {
        assertEquals("$109.95", Points.dollars(109.95));
    }

    @Test
    public void shortfallIsZeroWhenTheBalanceCoversTheCost() {
        assertEquals(0, Points.shortfall(50, 110));
        assertEquals(0, Points.shortfall(110, 110));
        assertEquals(50, Points.shortfall(110, 60));
    }

    @Test
    public void stockLabelsMatchTheWebsite() {
        assertEquals("Stock not set", Points.stockLabel(null));
        assertEquals("Out of stock", Points.stockLabel(0));
        assertEquals("12 in stock", Points.stockLabel(12));
    }

    @Test
    public void downscalesLargeImagesByPowersOfTwo() {
        assertEquals(1, Points.sampleSize(400, 400, 480));
        assertEquals(1, Points.sampleSize(900, 900, 480));
        assertEquals(2, Points.sampleSize(1000, 1500, 480));
        assertEquals(4, Points.sampleSize(2000, 3000, 480));
    }

    @Test
    public void joinsAddressPartsSkippingBlanks() {
        assertEquals("1 Main St, Clemson, 29631, USA", Points.addressLine("1 Main St", "Clemson", " ", "29631", "USA"));
    }
}
