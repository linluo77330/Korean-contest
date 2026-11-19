# CloudBridge: evidence and pricing provenance

Updated: 2026-11-18. The application uses packaged offline data; no live risk feed, customer cloud account, procurement, or payment connection is enabled.

## 1. Historical conflict observations

Dataset: **UCDP Georeferenced Event Dataset Global version 26.1**, Uppsala Conflict Data Program, Uppsala University. Source coverage: 1989–2025; this frontend includes complete calendar years 2016–2025.

- Download center: https://ucdp.uu.se/downloads/
- Source ZIP: https://ucdp.uu.se/downloads/ged/ged261-csv.zip
- Codebook: https://ucdp.uu.se/downloads/ged/ged261.pdf
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- CSV SHA-256: `61c3bf0a86374778343ba30c28a18b1fe739e2c33a76055504427eded4f8be27`
- Downloaded on 2026-11-17; ten-year transformation rebuilt on 2026-11-18 from the same SHA-256 verified CSV.

| Year | All records | Included in fine grid | Excluded for location precision | Occupied 1-degree cells |
|---|---:|---:|---:|---:|
| 2016 | 17,416 | 13,459 | 3,957 | 591 |
| 2017 | 16,412 | 12,529 | 3,883 | 695 |
| 2018 | 13,646 | 9,126 | 4,520 | 756 |
| 2019 | 13,911 | 9,144 | 4,767 | 764 |
| 2020 | 13,484 | 9,860 | 3,624 | 768 |
| 2021 | 17,316 | 12,204 | 5,112 | 830 |
| 2022 | 21,013 | 15,936 | 5,077 | 936 |
| 2023 | 27,422 | 21,750 | 5,672 | 915 |
| 2024 | 30,066 | 24,137 | 5,929 | 992 |
| 2025 | 25,770 | 19,362 | 6,408 | 970 |

Transformation: select year, then `where_prec` 1 or 2; aggregate by floor(longitude), floor(latitude), year and type_of_violence. A cell is [x,x+1) × [y,y+1). Longitude/latitude at the upper global boundary is placed in the last cell. Include up to two original-record samples per event type and cell, preserving event ID, date interval and date precision, location label, administrative region, dataset country grouping and location precision. No interpolation, coordinate jitter, fatality weighting, or hazard probability fitting is performed. Nonzero cell color bins are >0–<5, 5–<20, 20–<100, 100–<500 and ≥500 events per year. For single-year mode these equal the original integer count bins. Five- and ten-year baselines divide accumulated counts by all five or ten complete calendar years, including years with zero eligible records in a cell. Thresholds are shared across windows; cumulative multi-year totals are never used as map color intensity. Summary statistics are global for the selected window/type, not just the zoomed viewport. Source code: `scripts/build-conflict-data.py`.

`where_prec=1` identifies a named location, often represented by a town centroid, not a precise attack/facility coordinate. `where_prec=2` denotes a known point with uncertainty up to 25 km. Coarser records are counted separately and not placed in fine cells. `date_prec=1` means an exact day; 2 means 2–6 days, 3 a week, 4 a month and 5 a year. Grid areas vary with latitude, so this is **event count per cell**, not an equal-area risk density.

GED covers lethal organized violence, not every nonfatal sabotage, cable failure, coercive measure or cloud outage. The type filter uses 1 state-based conflict, 2 non-state conflict, and 3 one-sided violence. These categories are not CloudBridge policy eligibility categories. Country/administrative labels reproduce dataset conventions and do not establish sovereignty or insured-facility location. Missing records do not establish no risk. A 2025 annual map is not a live 2026 security assessment. UCDP Candidate 2026 exists but is not embedded or mixed with complete-year comparisons.

Attribution requested by the publisher:

- Davies, Shawn, Therése Pettersson and Magnus Öberg (2026). *Organized violence 1989–2025, and violent political protests*. Journal of Peace Research. https://doi.org/10.1093/jopres/xjag046
- Sundberg, Ralph and Erik Melander (2013). *Introducing the UCDP Georeferenced Event Dataset*. Journal of Peace Research 50(4), 523–532.
- Högbladh, Stina (2026). *UCDP GED Codebook version 26.1*. Department of Peace and Conflict Research, Uppsala University.
- UCDP is part of and funded by DEMSCORE, national research infrastructure grant 2021-00162 from the Swedish Research Council.

CloudBridge's grid aggregation and presentation are derivatives; no endorsement by the data publisher is implied.

## 2. Public infrastructure catalog — expanded 2026-11-17

The catalog now contains 706 entries across 10 providers: 316 cloud regions, 42 classic data-center identifiers and 348 edge-city nodes. These are distinct catalog object types, NOT 706 separate physical facilities. Provider catalogs have different product scopes; the inventory is complete within the cited source tables, not a claim to enumerate every private, undisclosed or newly announced global facility.

| Provider | Catalog entries | Mainland China entries |
|---|---:|---:|
| Oracle Cloud | 53 | 0 |
| IBM Cloud | 55 | 0 |
| Cloudflare | 348 | 36 |
| Azure | 69 | 6 |
| AWS | 39 | 2 |
| Alibaba Cloud | 31 | 13 |
| Tencent Cloud | 26 | 12 |
| Volcengine | 6 | 3 |
| Huawei Cloud | 36 | 13 |
| Google Cloud | 43 | 0 |

Sources and normalized original records are retained in `data/cloud-catalogs/*.json`. Rebuild the offline JS and downloadable CSV with `python3 scripts/build-exposure-data.py`. Each row includes its official source, code, location precision, infrastructure type, partition, operator and catalog status. The CSV is available as `cloud-infrastructure.csv`.

- Azure includes public, China (21Vianet), and government catalogs. Announced regions are marked separately. Original China North and China East are retired based on the July 2026 retirement notice. All six Azure China rows have no map coordinate because the official location field is unpublished; their country identity remains searchable.
- AWS includes commercial, China, GovCloud and European Sovereign partitions.
- Alibaba and Tencent use full ECS/VPC regional tables. Huawei combines its infrastructure and SCP catalogs, retaining partner realms. Volcengine uses its full Auto Scaling regional table; discrepancies between published zone counts and zone identifiers are retained in source records.
- Google Cloud includes all 43 region groups and 130 zone rows in its Compute Engine table.
- Oracle includes 45 public and 8 government/defense regions. IBM separates 13 MZR/SC-MZR rows from 42 classic data-center identifiers; these can overlap geographically or physically. IBM CHE01 has end-of-market/existing-account restrictions.
- Cloudflare lists 348 edge cities. Its 36 mainland-China entries belong to the separately subscribed China Network with JD Cloud cooperation and selected-product availability. `city-*` identifiers are editorial catalog keys, not provider region codes. Edge presence is not a customer-selectable VM/AI compute region.

Approximate city coordinates in the additional-provider catalog use GeoNames (CC BY 4.0): https://www.geonames.org/export/ . They identify city centers, not facilities. Other representative coordinates are editorial region/city label positions. Ten entries have no plotted coordinate, including six Azure China entries and four ambiguous city names. Unlocated entries remain in the catalog and do not get invented map pins.

Official source indexes:

- Oracle Cloud: https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm, https://docs.oracle.com/iaas/Content/gov-cloud/ausgov.htm, https://docs.oracle.com/iaas/Content/gov-cloud/govfeddod.htm, https://docs.oracle.com/iaas/Content/gov-cloud/govfedramp.htm, https://docs.oracle.com/iaas/Content/gov-cloud/govuksouth.htm
- IBM Cloud: https://cloud.ibm.com/docs/overview?topic=overview-locations
- Cloudflare: https://www.cloudflare.com/network/
- Azure: https://learn.microsoft.com/en-us/azure/azure-government/documentation-government-welcome, https://learn.microsoft.com/en-us/azure/china/overview-regions, https://learn.microsoft.com/en-us/azure/reliability/regions-list
- AWS: https://aws.amazon.com/blogs/publicsector/architecting-a-secure-landing-zone-in-the-aws-european-sovereign-cloud/, https://docs.amazonaws.cn/en_us/general/latest/gr/ARNs.html, https://docs.aws.amazon.com/en_en/general/latest/gr/rande.html, https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html
- Alibaba Cloud: https://www.alibabacloud.com/help/en/ecs/user-guide/regions-and-zones
- Tencent Cloud: https://www.tencentcloud.com/document/product/215/31786
- Volcengine: https://docs.volcengine.com/docs/as/regions-and-availability-zones?lang=zh
- Huawei Cloud: https://activity.huaweicloud.com/intl/es-us/infraestructura1.html, https://support.huaweicloud.com/intl/en-us/usermanual-organizations/org_03_0082.html
- Google Cloud: https://docs.cloud.google.com/compute/docs/regions-zones

Product/SKU availability, live health, exact customer deployment and capacity remain separate checks.

## 3. Additional sources researched, not imported

- RIPE Atlas measurements: https://atlas.ripe.net/ and https://atlas.ripe.net/measurements/public/ — potential latency, packet-loss and path-change evidence, not proof of a particular customer's workload path.
- ACLED access: https://acleddata.com/faq/how-can-i-access-and-use-acled-data and https://acleddata.com/eula — potentially broader political violence/protest coverage; requires appropriate access and redistribution permission. No ACLED records are packaged.
- Google Cloud Location Finder: https://docs.cloud.google.com/location-finder/docs/overview — candidate automated location catalog; project/authentication requirements apply. Not connected.
- Microsoft global network: https://learn.microsoft.com/en-us/azure/networking/microsoft-global-network — describes connectivity mechanisms, not the customer's actual routing.
- TeleGeography cable FAQ: https://www2.telegeography.com/submarine-cable-faqs-frequently-asked-questions — published cable routes are stylized. No cable geometry is copied or treated as a verified cloud dependency.
- PeeringDB: https://docs.peeringdb.com/howto/get-started-facility/ — network/facility metadata candidate, not proof of cloud workload placement. No database records are embedded.

## 4. Risk-to-pricing link and remaining assumptions

The frontend now separates evidence display from actuarial assumptions. Hazard observations and public region metadata support investigation; they do **not** feed a made-up conversion of conflict counts to insured outage probability. User map filters never change an application, its quote or a confirmed policy.

The unverified links still needed for an empirical M2 model are:

1. Eligible source-event frequency, with spatial/temporal reporting bias and non-lethal events addressed.
2. Identified facilities, power feeds and actual communication paths used by each scheduled service.
3. Conditional failure/propagation probabilities given event intensity and infrastructure vulnerability.
4. Original-service outage and recovery distributions, based on incident records and redundancy configuration.
5. Policy eligibility (including third-country/causal-chain tests), waiting time, limits and other payout constraints.

The recovery view displays the same three event paths and duration weights used by the CP-2.0 scenario engine. Region annual event probabilities, conditional impacts, AI multipliers and recovery factors remain explicit illustrative assumptions from `m2-risk.js`. `duration2` scales the reference durations by duration2/8. M1 uses its existing assumed annual event probabilities, a conditional impact probability, and three duration multiples (0.4, 1, 3) with weights (0.55, 0.30, 0.15). Distinct M1/M2 events are simulated; the model does not count one event in both modules. Cross-region/common-provider catastrophe dependence is not calibrated.

## 5. Four-component pricing

`dist/pricing.js` uses 20,000 reproducible simulated years (seed 20261117), with shared regional event streams across the applicant and two reference firms. It applies waiting periods, hourly amounts, per-service/event caps, module annual caps and the shared annual cap chronologically. The same event does not bypass the shared occurrence cap for multiple services.

- EL: average **gross** annual parametric payout (before reinsurance).
- Proportional reinsurance: default 20% cession; total treaty premium = portfolio expected recoveries × 1.30. Allocation uses expected recovery shares. RC = allocated premium − expected recovery, avoiding recovery double-counting.
- Capital: rank annual portfolio **net** claims, take the worst 1% (200 years), then allocate K_i = mean client net claims in these years − mean annual client net claims. Sum of allocations equals portfolio tail mean minus portfolio annual mean, up to rounding. cK uses default annual capital rate 8%.
- Fixed expense F defaults to CNY 350; variable expense e defaults to 25%.
- G = (EL + RC + cK + F)/(1−e). The fourth display component is F+eG. Old riskLoad and correlation loadings are not stacked on top. M1/M2 gross-premium splits are allocated by their EL shares, not independently re-priced products.

**Contract-basis limitation:** the new view is a round-the-clock original-service **parametric pricing scenario**. The existing claims engine also applies business operating hours, successful customer failover and covered net-loss constraints. The scenario EL has not been calibrated to those constraints; it is not a validated expected payout under every existing contract. This distinction appears in the EL calculation details. The task did not silently rewrite claims or historical settlements. Any production release requires choosing a single contract basis and calibrating pricing and claims together.

Confirmed policies keep their original quote/model snapshot. Old confirmed quotes without cost breakdown are shown alongside a clearly separate current-model comparison. Unbound old quotes are invalidated on CP-2.0 migration. Cost amounts and seeded results are demonstrations, not an insurer's approved tariff or actual reinsurance terms.

Methodology references:
- Verisk Touchstone EP summary: https://docs.risksolutions.verisk.com/touchstone/9.0/ts-tsre_all/help_ts_loss-analysis_summary-ep-table.html
- CAS, Introduction to Capital Modeling: https://www.casact.org/sites/default/files/2026-01/CAS_Monograph_15_-_Intro_to_Capital_Modeling.pdf

## 6. Map rendering

Natural Earth 1:50m physical land (public domain, via world-atlas 2.0.2), no administrative boundaries. Offline Natural Earth 1 projection shared between the existing basemap, conflict grid and region labels. Formula reference: https://github.com/d3/d3-geo/blob/main/src/projection/naturalEarth1.js . No external map tile service is needed during the presentation.

## 7. Paginated event directory

The local data files retain all 196,456 GED records for 2016–2025. The event directory displays **only records in the explicitly selected 1° map cell**, using the same coordinate bounds, `where_prec` 1–2 inclusion and grid-boundary rules as the heatmap. The selected five-year, ten-year or single-year window and event-type filter apply to that cell. With no cell selected, it prompts the user to select one; it never falls back to global/country-wide events. Per-year JSON files for the selected window load on demand and are indexed by cell; the directory appears only after all selected years load successfully. Failures show a retry rather than incomplete totals. Five records appear per page, with first/previous/next/last navigation and a validated direct page-number jump. Changing the cell, observation window, year or event type resets pagination. Each row preserves its event ID, date interval, type, country/admin labels, location name and location/date precision; `gridCell` links eligible records to the heatmap. Coarse-location records have a null grid and remain outside the map-linked directory. Rebuild with `scripts/build-event-directory.py` and the same source CSV described above.

## 8. Selected insured exposure

The exposure overview aggregates the entire geolocated current inventory into sparse markers (44 groups in the current snapshot); eight quick-navigation shortcuts remain in a collapsible section. Clicking a facility cluster or quick-navigation shortcut drills down into nearby infrastructure. Selecting an event cell or blank map position updates the selection without changing the camera. Nearby browsing uses ±25° longitude and latitude by default, adjustable to ±15° or ±40°. Longitude distance wraps at the antimeridian; latitude is bounded at the poles. This is a geographic browsing window, not a calibrated event impact area. Nearby entries whose projected positions are within a zoom-scaled grouping threshold (40 base-map units at global width 960, or 26 at regional width 960) of a group anchor share a count marker, preventing overlapping click targets. The anchor retains the first entry’s representative coordinate; selecting a group reveals every constituent entry, each with its original source and published location. Grouping is for display, not a claim of a shared physical facility. Coordinates are never jittered. Edge nodes, cloud regions and classic datacenters retain their type labels. Unknown locations are retained in the full catalog but cannot be included in geographic searches. A genuinely empty area remains empty; range can be expanded explicitly.

Checkboxes in the scheduled service/dependency table additionally highlight the current applicant's services (confirmed policies use locked terms). One larger blue marker per selected coverage region summarizes relevant services; these use existing policy-region representative coordinates, not exact facility addresses or a verified service-to-facility assignment. The hazard heatmap remains visible. Selecting a hazard cell still filters the event directory to that single 1° cell; the larger infrastructure window never broadens the event directory. All browsing state is presentation-only and does not change premiums, policy terms, claims or model probabilities. The complete public infrastructure catalog remains available in the expandable reference section.

## 9. Map navigation

Progressive clicks on quick-navigation shortcuts, clusters and facilities reduce the viewport width, with a bounded back-navigation history. The search-window outline and outer map frame are removed. Pointer-based two-finger pinch, one-finger/mouse pan, cursor-anchored wheel/trackpad zoom, and Safari GestureEvent handlers operate on the SVG viewport; facility groups are refreshed after gestures end. Viewport width is bounded to 12–960 map units. Nearby records follow the exposure viewport after a gesture; zooming back out restores overview hubs. Spatial browsing and gesture navigation never widen the event directory beyond its selected 1° cell or mutate pricing/claims inputs.

Hazard-cell clicks preserve both the viewport center and width in all map layers, including repeated clicks and selection after a manual locate/zoom action. They highlight the cell and filter its event directory without adding a zoom-history entry. A four-part legend distinguishes numbered regional clusters, cloud regions, classic datacenters and edge nodes. Cluster size means directory entry count, not physical capacity, insured loss, Tier level or a verified dependency hierarchy. Mixed groups use the aggregate symbol; individual type symbols retain the published infrastructure classification. Nearby cloud/datacenter entries are grouped first, with edge entries merged where appropriate. The exposure heatmap is visually subdued while retaining the same event-count bins and source data.

## 10. Multi-year baseline and annual trend

The default hazard layer is the 2021–2025 mean annual count. Users can select the 2016–2025 ten-year comparison or query any single year from 2016–2025. `hazard-history.js` caches observation aggregates without modifying original annual arrays or the pricing model.

The side panel shows a 2016–2025 annual series for the selected cell, or for globally mapped events before a cell is selected. Highlighted bars correspond to the selected window. Selecting a year enters single-year mode, filters the same cell directory and preserves the camera. Years with no qualifying mapped records are explicitly zero; that does not establish zero actual hazard. A selected cell that has no records in a chosen year retains an outline and a zero count so its longer-term trend remains accessible.

Five- and ten-year choices are exploratory observation windows, not validated calibration horizons. No recency weighting, trend-to-probability conversion, 2026 partial-year mixing, or automatic premium recalculation is performed. Nonfatal infrastructure sabotage and observed outage/recovery linkage remain outside this GED history.
