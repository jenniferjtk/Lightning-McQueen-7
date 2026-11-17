package com.lightningmcqueen.driver;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.time.ZoneId;

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

    @Test
    public void orderStatusLabelsMatchTheWebsite() {
        assertEquals("Pending", Points.statusLabel("pending"));
        assertEquals("Shipped", Points.statusLabel("shipped"));
        assertEquals("Delivered", Points.statusLabel("delivered"));
        assertEquals("Canceled", Points.statusLabel("canceled"));
        assertEquals("returned", Points.statusLabel("returned"));
    }

    @Test
    public void orderDatesUseTheDriversTimeZone() {
        // 2:30am UTC on Nov 5 is still Nov 4 in South Carolina.
        assertEquals("Nov 4, 2026", Points.orderDate("2026-11-05T02:30:00.000Z", ZoneId.of("America/New_York")));
        assertEquals("Nov 5, 2026", Points.orderDate("2026-11-05T02:30:00.000Z", ZoneId.of("UTC")));
        assertEquals("", Points.orderDate("not a date", ZoneId.of("UTC")));
        assertEquals("", Points.orderDate(null, ZoneId.of("UTC")));
    }

    @Test
    public void deliveryLabelsMatchTheWebsite() {
        assertEquals("Arrives by Nov 11, 2026", Points.deliveryLabel("pending", "2026-11-11"));
        assertEquals("Arrives by Nov 11, 2026", Points.deliveryLabel("shipped", "2026-11-11"));
        assertEquals("Delivered", Points.deliveryLabel("delivered", "2026-11-11"));
        assertEquals("", Points.deliveryLabel("canceled", null));
        assertEquals("", Points.deliveryLabel("pending", ""));
    }
}
