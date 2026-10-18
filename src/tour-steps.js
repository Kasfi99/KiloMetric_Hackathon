// Onboarding tour content: pure data so it is unit-tested; src/tour.jsx renders it.
// Bump TOUR_VERSION when the copy changes so every device sees the tour again.
export const TOUR_VERSION=1;
export const tourKey=role=>`km.tour.v${TOUR_VERSION}.${role}`;

// Pages each role may open, in nav order. The nav in main.jsx uses this too.
export const ROLE_PAGES={
 admin:['overview','trucks','parts','maintenance','optimizer','ai','trips','orders','users'],
 manager:['overview','trucks','parts','maintenance','optimizer','ai','trips'],
 workshop:['trucks','parts','maintenance'],
 driver:['trips'],
};
export const pagesFor=role=>ROLE_PAGES[role]||ROLE_PAGES.admin;

// target = data-tour attribute to spotlight; nav-<page> points at the menu item itself.
const PAGE_STEPS=[
 {page:'overview',target:'overview-metrics',title:'Overview',body:'Your fleet at a glance. Maintenance CPK is total maintenance spend divided by total distance, so long-running trucks weigh more than short ones.'},
 {page:'trucks',target:'trucks-table',title:'Trucks',body:'Trucks ranked by maintenance cost per km, highest first. A truck is flagged when it costs 1.2× or more than similar trucks. Click a row to see the visits and parts behind its cost.'},
 {page:'parts',target:'parts-tabs',title:'Spare parts',body:'Each part’s real lifespan and cost per km, grouped by category. Compare brands on what they cost over their life, not on the invoice price.'},
 {page:'maintenance',target:'page-action',title:'Maintenance',body:'Log every workshop visit here: truck, odometer, parts and labor. Mileage and CPK update on their own, so nobody types CPK.'},
 {page:'optimizer',target:'nav-optimizer',title:'Mix optimizer',body:'Pick a truck model and duty to see which brand had the lowest observed cost per km for each part position, with the sample count beside it.'},
 {page:'ai',target:'nav-ai',title:'Gemini insights',body:'Gemini reads the latest records and explains the numbers and the data gaps. It never calculates them.'},
 {page:'trips',target:'nav-trips',title:'Trips & GPS',body:'Driver trips: declared load, phone GPS track, and odometer photos at departure and arrival.'},
 {page:'orders',target:'nav-orders',title:'Delivery orders',body:'Upload a delivery note as a PDF or photo. Review the extracted draft, then assign a driver and truck to get distance, toll and a cost estimate.'},
 {page:'users',target:'nav-users',title:'People & access',body:'Add accounts, set roles, and choose which trucks each driver may use.'},
];

const WELCOME={page:null,target:null,title:'Welcome to KiloMetric',body:'KiloMetric turns workshop records into maintenance cost per kilometer for every truck and spare part. This short guide shows what each menu is for and how to use it.'};
const DRIVER_WELCOME={...WELCOME,body:'This is where you start and track your delivery trips. This short guide shows how.'};
const DRIVER_TRIPS='Start a trip here: choose your assigned truck, declare the cargo weight, and share your phone GPS. On your phone, the driver app at /driver is easier to use.';
const REPLAY={page:null,target:'tour-replay',title:'Replay any time',body:'Open this guide again from the Guide button.'};

export function tourSteps(role){
 const pages=pagesFor(role),driver=role==='driver';
 const steps=PAGE_STEPS.filter(s=>pages.includes(s.page)).map(s=>driver&&s.page==='trips'?{...s,body:DRIVER_TRIPS}:s);
 return [driver?DRIVER_WELCOME:WELCOME,...steps,REPLAY];
}
