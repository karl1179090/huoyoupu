import React, { useState, useEffect, useRef } from 'react';
import type { Customer, Address, PriceRule, Product, PriceQuote } from '../../api/types.js';
import * as api from '../../api/client.js';
import { WarehouseListPage } from './WarehouseListPage.js';
import {
  UsersIcon,
  SearchIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  AlertCircleIcon,
  CheckIcon,
} from '../../components/icons/index.js';

export interface CustomerListPageProps {
  onNavigateToSource?: (href: string) => void;
}

export interface PriceQuoteScope {
  customerId: string;
  modalSeq: number;
  productId: string;
  unitId: string;
  quoteGen: number;
}

// Helper: Exhaustively fetch all customer price rules across pages with cancellation scope
export async function fetchAllCustomerPriceRules(
  customerId: string,
  seq: number,
  isScopeValid: (customerId: string, seq: number) => boolean,
  fetchPage: (customerId: string, options: { limit: number; cursor?: string }) => Promise<{ items: PriceRule[]; nextCursor: string | null }>
): Promise<PriceRule[] | null> {
  const allRules: PriceRule[] = [];
  let cursor: string | undefined = undefined;
  do {
    if (!isScopeValid(customerId, seq)) {
      return null;
    }
    const res = await fetchPage(customerId, { limit: 100, cursor });
    if (!isScopeValid(customerId, seq)) {
      return null;
    }
    allRules.push(...res.items);
    cursor = res.nextCursor || undefined;
  } while (cursor);
  return allRules;
}

// Helper: Exhaustively fetch all selectable products across pages with cancellation scope
export async function fetchAllProductsForRules(
  customerId: string,
  seq: number,
  isScopeValid: (customerId: string, seq: number) => boolean,
  fetchPage: (options: { limit: number; cursor?: string }) => Promise<{ items: Product[]; nextCursor: string | null }>
): Promise<Product[] | null> {
  const allProducts: Product[] = [];
  let cursor: string | undefined = undefined;
  do {
    if (!isScopeValid(customerId, seq)) {
      return null;
    }
    const res = await fetchPage({ limit: 100, cursor });
    if (!isScopeValid(customerId, seq)) {
      return null;
    }
    allProducts.push(...res.items);
    cursor = res.nextCursor || undefined;
  } while (cursor);
  return allProducts;
}

// Helper: Resolve price quote with strict product/unit and quote generation scope
export async function resolvePriceQuoteWithScope(
  customerId: string,
  productId: string,
  unitId: string,
  modalSeq: number,
  quoteGen: number,
  isScopeValid: (customerId: string, productId: string, unitId: string, modalSeq: number, quoteGen: number) => boolean,
  fetchQuote: (customerId: string, query: { productId: string; unitId: string }) => Promise<PriceQuote>
): Promise<PriceQuote | null> {
  const quote = await fetchQuote(customerId, { productId, unitId });
  if (isScopeValid(customerId, productId, unitId, modalSeq, quoteGen)) {
    return quote;
  }
  return null;
}

export function CustomerListPage({ onNavigateToSource }: CustomerListPageProps = {}) {
  const [catalogTab, setCatalogTab] = useState<'customers' | 'warehouses'>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Products cache for price rules
  const [products, setProducts] = useState<Product[]>([]);

  // Create Customer Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Customer Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Multi-address Management Modal
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addrContact, setAddrContact] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrText, setAddrText] = useState('');
  const [addrLabel, setAddrLabel] = useState('总店');
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);

  // Edit Address State (AddressPatch)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [editAddrContact, setEditAddrContact] = useState('');
  const [editAddrPhone, setEditAddrPhone] = useState('');
  const [editAddrText, setEditAddrText] = useState('');
  const [editAddrLabel, setEditAddrLabel] = useState('');
  const [savingAddrEdit, setSavingAddrEdit] = useState(false);

  // Customer Price Rules Modal
  const [priceRulesModalOpen, setPriceRulesModalOpen] = useState(false);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [priceRulesLoading, setPriceRulesLoading] = useState(false);
  const [ruleProductId, setRuleProductId] = useState('');
  const [ruleUnitId, setRuleUnitId] = useState('');
  const [rulePrice, setRulePrice] = useState('');
  const [ruleActionError, setRuleActionError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  // Live Price Quote Preview & Source Tracing
  const [priceQuotePreview, setPriceQuotePreview] = useState<PriceQuote | null>(null);
  const [quotePreviewLoading, setQuotePreviewLoading] = useState(false);

  // Request scope isolation tracker for price rules / products fetch
  const priceRulesScopeRef = useRef<{ customerId: string; seq: number }>({ customerId: '', seq: 0 });
  const quoteScopeRef = useRef<PriceQuoteScope>({
    customerId: '',
    modalSeq: 0,
    productId: '',
    unitId: '',
    quoteGen: 0,
  });
  const customerListSeqRef = useRef(0);

  useEffect(() => {
    void loadCustomers();
  }, [includeInactive]);

  const loadCustomers = async (cursor?: string, qOverride?: string) => {
    const seq = ++customerListSeqRef.current;
    setLoading(true);
    try {
      const queryStr = qOverride !== undefined ? qOverride : searchQuery;
      const res = await api.listCustomers({
        q: queryStr.trim() || undefined,
        limit: 50,
        cursor,
      });
      if (seq !== customerListSeqRef.current) return;
      if (cursor) {
        setCustomers(prev => [...prev, ...res.items]);
      } else {
        setCustomers(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch {
      if (seq === customerListSeqRef.current && !cursor) setCustomers([]);
    } finally {
      if (seq === customerListSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.createCustomer({
        code: code.trim(),
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setCreateModalOpen(false);
      setCode('');
      setName('');
      setContactName('');
      setPhone('');
      setNotes('');
      await loadCustomers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : '创建客户失败');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setEditName(cust.name);
    setEditContact(cust.contactName || '');
    setEditPhone(cust.phone || '');
    setEditNotes(cust.notes || '');
    setEditActive(cust.active);
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !editName.trim()) return;
    setSavingCustomer(true);
    setEditError(null);
    try {
      const updated = await api.updateCustomer(selectedCustomer.id, {
        expectedVersion: selectedCustomer.version,
        name: editName.trim(),
        contactName: editContact.trim() || '',
        phone: editPhone.trim() || '',
        notes: editNotes.trim() || '',
        active: editActive,
      });
      setSelectedCustomer(updated);
      setEditModalOpen(false);
      void loadCustomers();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : '保存客户修改失败');
    } finally {
      setSavingCustomer(false);
    }
  };

  const openAddressModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setAddrContact(cust.contactName || '');
    setAddrPhone(cust.phone || '');
    setAddrText('');
    setAddrLabel('仓库/门店');
    setAddrIsDefault(cust.addresses.length === 0);
    setEditingAddress(null);
    setAddrError(null);
    setAddressModalOpen(true);
  };

  const refreshSelectedCustomer = async (customerId: string) => {
    try {
      const refreshed = await api.getCustomer(customerId);
      setSelectedCustomer(refreshed);
      setCustomers(prev => prev.map(c => (c.id === customerId ? refreshed : c)));
    } catch {
      // ignore
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !addrContact.trim() || !addrText.trim()) return;
    setSavingAddr(true);
    setAddrError(null);
    try {
      await api.createCustomerAddress(selectedCustomer.id, {
        contactName: addrContact.trim(),
        phone: addrPhone.trim() || undefined,
        address: addrText.trim(),
        label: addrLabel.trim() || undefined,
        isDefault: addrIsDefault,
      });
      setAddrText('');
      await refreshSelectedCustomer(selectedCustomer.id);
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : '添加配送地址失败');
    } finally {
      setSavingAddr(false);
    }
  };

  const startEditAddress = (addr: Address) => {
    setEditingAddress(addr);
    setEditAddrContact(addr.contactName);
    setEditAddrPhone(addr.phone || '');
    setEditAddrText(addr.address);
    setEditAddrLabel(addr.label || '');
    setAddrError(null);
  };

  const cancelEditAddress = () => {
    setEditingAddress(null);
    setAddrError(null);
  };

  const handleSaveEditAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !editingAddress || !editAddrContact.trim() || !editAddrText.trim()) return;
    setSavingAddrEdit(true);
    setAddrError(null);
    try {
      // Explicitly send trimmed string (including empty string "" when cleared) so backend clears old value
      await api.updateCustomerAddress(selectedCustomer.id, editingAddress.id, {
        expectedVersion: editingAddress.version,
        contactName: editAddrContact.trim(),
        phone: editAddrPhone.trim(),
        address: editAddrText.trim(),
        label: editAddrLabel.trim(),
      });
      setEditingAddress(null);
      await refreshSelectedCustomer(selectedCustomer.id);
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : '更新配送地址失败');
    } finally {
      setSavingAddrEdit(false);
    }
  };

  const handleToggleAddressDefault = async (addr: Address) => {
    if (!selectedCustomer) return;
    setAddrError(null);
    try {
      await api.updateCustomerAddress(selectedCustomer.id, addr.id, {
        expectedVersion: addr.version,
        isDefault: true,
      });
      await refreshSelectedCustomer(selectedCustomer.id);
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : '设为默认地址失败');
    }
  };

  const handleToggleAddressActive = async (addr: Address) => {
    if (!selectedCustomer) return;
    setAddrError(null);
    try {
      await api.updateCustomerAddress(selectedCustomer.id, addr.id, {
        expectedVersion: addr.version,
        active: !addr.active,
      });
      await refreshSelectedCustomer(selectedCustomer.id);
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : '更新地址状态失败');
    }
  };

  const loadPriceQuotePreview = async (
    customerId: string,
    productId: string,
    unitId: string,
    modalSeq: number,
    quoteGen: number
  ) => {
    if (!customerId || !productId || !unitId) {
      setQuotePreviewLoading(false);
      return;
    }
    setQuotePreviewLoading(true);
    try {
      const quote = await resolvePriceQuoteWithScope(
        customerId,
        productId,
        unitId,
        modalSeq,
        quoteGen,
        (cId, pId, uId, mSeq, qGen) =>
          priceRulesScopeRef.current.customerId === cId &&
          priceRulesScopeRef.current.seq === mSeq &&
          quoteScopeRef.current.customerId === cId &&
          quoteScopeRef.current.modalSeq === mSeq &&
          quoteScopeRef.current.productId === pId &&
          quoteScopeRef.current.unitId === uId &&
          quoteScopeRef.current.quoteGen === qGen,
        api.getCustomerPriceQuote
      );
      if (quote) {
        setPriceQuotePreview(quote);
      }
    } catch {
      if (
        priceRulesScopeRef.current.customerId === customerId &&
        priceRulesScopeRef.current.seq === modalSeq &&
        quoteScopeRef.current.quoteGen === quoteGen
      ) {
        setPriceQuotePreview(null);
      }
    } finally {
      if (
        priceRulesScopeRef.current.customerId === customerId &&
        priceRulesScopeRef.current.seq === modalSeq &&
        quoteScopeRef.current.quoteGen === quoteGen
      ) {
        setQuotePreviewLoading(false);
      }
    }
  };

  const openPriceRulesModal = async (cust: Customer) => {
    const nextSeq = ++priceRulesScopeRef.current.seq;
    priceRulesScopeRef.current.customerId = cust.id;
    quoteScopeRef.current = {
      customerId: cust.id,
      modalSeq: nextSeq,
      productId: '',
      unitId: '',
      quoteGen: 0,
    };
    setSelectedCustomer(cust);
    setRuleActionError(null);
    setPriceQuotePreview(null);
    setPriceRulesModalOpen(true);
    setPriceRulesLoading(true);

    try {
      const [rules, prods] = await Promise.all([
        fetchAllCustomerPriceRules(
          cust.id,
          nextSeq,
          (cId, seq) => priceRulesScopeRef.current.customerId === cId && priceRulesScopeRef.current.seq === seq,
          api.listCustomerPriceRules
        ),
        fetchAllProductsForRules(
          cust.id,
          nextSeq,
          (cId, seq) => priceRulesScopeRef.current.customerId === cId && priceRulesScopeRef.current.seq === seq,
          api.listProducts
        ),
      ]);

      // Verify scope hasn't changed or closed
      if (priceRulesScopeRef.current.customerId !== cust.id || priceRulesScopeRef.current.seq !== nextSeq) {
        return;
      }

      if (rules) setPriceRules(rules);
      if (prods) {
        setProducts(prods);
        if (prods.length > 0) {
          const firstProd = prods[0]!;
          setRuleProductId(firstProd.id);
          const firstUnitId = firstProd.baseUnitId || firstProd.units[0]?.id || '';
          setRuleUnitId(firstUnitId);
          setRulePrice(firstProd.units[0]?.defaultSalePrice || '0.00');
          const nextQuoteGen = ++quoteScopeRef.current.quoteGen;
          quoteScopeRef.current = {
            customerId: cust.id,
            modalSeq: nextSeq,
            productId: firstProd.id,
            unitId: firstUnitId,
            quoteGen: nextQuoteGen,
          };
          void loadPriceQuotePreview(cust.id, firstProd.id, firstUnitId, nextSeq, nextQuoteGen);
        }
      }
    } catch (err: unknown) {
      if (priceRulesScopeRef.current.customerId === cust.id && priceRulesScopeRef.current.seq === nextSeq) {
        setRuleActionError(err instanceof Error ? err.message : '加载专属价格规则失败');
      }
    } finally {
      if (priceRulesScopeRef.current.customerId === cust.id && priceRulesScopeRef.current.seq === nextSeq) {
        setPriceRulesLoading(false);
      }
    }
  };

  const closePriceRulesModal = () => {
    priceRulesScopeRef.current = { customerId: '', seq: ++priceRulesScopeRef.current.seq };
    quoteScopeRef.current = {
      customerId: '',
      modalSeq: 0,
      productId: '',
      unitId: '',
      quoteGen: ++quoteScopeRef.current.quoteGen,
    };
    setPriceRulesModalOpen(false);
    setPriceQuotePreview(null);
    setQuotePreviewLoading(false);
    setRuleActionError(null);
  };

  const handleProductChange = (prodId: string) => {
    setRuleProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod && prod.units.length > 0) {
      const defaultUnit = prod.units.find(u => u.id === prod.baseUnitId) || prod.units[0]!;
      setRuleUnitId(defaultUnit.id);
      setRulePrice(defaultUnit.defaultSalePrice);
      // Immediately clear previous preview and advance quote generation counter
      setPriceQuotePreview(null);
      if (selectedCustomer) {
        const nextQuoteGen = ++quoteScopeRef.current.quoteGen;
        quoteScopeRef.current = {
          customerId: selectedCustomer.id,
          modalSeq: priceRulesScopeRef.current.seq,
          productId: prodId,
          unitId: defaultUnit.id,
          quoteGen: nextQuoteGen,
        };
        void loadPriceQuotePreview(selectedCustomer.id, prodId, defaultUnit.id, priceRulesScopeRef.current.seq, nextQuoteGen);
      }
    }
  };

  const handleUnitChange = (unitId: string) => {
    setRuleUnitId(unitId);
    const prod = products.find(p => p.id === ruleProductId);
    const unit = prod?.units.find(u => u.id === unitId);
    if (unit) {
      setRulePrice(unit.defaultSalePrice);
      // Immediately clear previous preview and advance quote generation counter
      setPriceQuotePreview(null);
      if (selectedCustomer && ruleProductId) {
        const nextQuoteGen = ++quoteScopeRef.current.quoteGen;
        quoteScopeRef.current = {
          customerId: selectedCustomer.id,
          modalSeq: priceRulesScopeRef.current.seq,
          productId: ruleProductId,
          unitId: unitId,
          quoteGen: nextQuoteGen,
        };
        void loadPriceQuotePreview(selectedCustomer.id, ruleProductId, unitId, priceRulesScopeRef.current.seq, nextQuoteGen);
      }
    }
  };

  const handleSavePriceRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !ruleProductId || !ruleUnitId || !rulePrice.trim()) return;
    setSavingRule(true);
    setRuleActionError(null);

    // Find existing rule across all loaded pages
    const existingRule = priceRules.find(
      r => r.productId === ruleProductId && r.unitId === ruleUnitId
    );
    const expectedVersion = existingRule ? existingRule.version : 0;
    const currentCustId = selectedCustomer.id;
    const currentSeq = priceRulesScopeRef.current.seq;

    try {
      await api.upsertCustomerPriceRule(currentCustId, ruleProductId, ruleUnitId, {
        expectedVersion,
        unitPrice: rulePrice.trim(),
      });
      // Exhaustively reload rules to maintain complete version and items sync
      const refreshedRules = await fetchAllCustomerPriceRules(
        currentCustId,
        currentSeq,
        (cId, seq) => priceRulesScopeRef.current.customerId === cId && priceRulesScopeRef.current.seq === seq,
        api.listCustomerPriceRules
      );
      if (refreshedRules && priceRulesScopeRef.current.customerId === currentCustId && priceRulesScopeRef.current.seq === currentSeq) {
        setPriceRules(refreshedRules);
        const nextQuoteGen = ++quoteScopeRef.current.quoteGen;
        quoteScopeRef.current = {
          customerId: currentCustId,
          modalSeq: currentSeq,
          productId: ruleProductId,
          unitId: ruleUnitId,
          quoteGen: nextQuoteGen,
        };
        void loadPriceQuotePreview(currentCustId, ruleProductId, ruleUnitId, currentSeq, nextQuoteGen);
      }
    } catch (err: unknown) {
      setRuleActionError(err instanceof Error ? err.message : '保存专属价格规则失败');
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeletePriceRule = async (rule: PriceRule) => {
    if (!selectedCustomer) return;
    setRuleActionError(null);
    const currentCustId = selectedCustomer.id;
    const currentSeq = priceRulesScopeRef.current.seq;

    try {
      await api.deleteCustomerPriceRule(
        currentCustId,
        rule.productId,
        rule.unitId,
        { expectedVersion: rule.version }
      );
      const refreshedRules = await fetchAllCustomerPriceRules(
        currentCustId,
        currentSeq,
        (cId, seq) => priceRulesScopeRef.current.customerId === cId && priceRulesScopeRef.current.seq === seq,
        api.listCustomerPriceRules
      );
      if (refreshedRules && priceRulesScopeRef.current.customerId === currentCustId && priceRulesScopeRef.current.seq === currentSeq) {
        setPriceRules(refreshedRules);
        if (ruleProductId === rule.productId && ruleUnitId === rule.unitId) {
          const nextQuoteGen = ++quoteScopeRef.current.quoteGen;
          quoteScopeRef.current = {
            customerId: currentCustId,
            modalSeq: currentSeq,
            productId: ruleProductId,
            unitId: ruleUnitId,
            quoteGen: nextQuoteGen,
          };
          void loadPriceQuotePreview(currentCustId, ruleProductId, ruleUnitId, currentSeq, nextQuoteGen);
        }
      }
    } catch (err: unknown) {
      setRuleActionError(err instanceof Error ? err.message : '删除专属价规则失败');
    }
  };

  const handleJumpToOrder = (orderId: string, revisionId?: string | null) => {
    const href = revisionId ? `/orders/${orderId}/revisions/${revisionId}` : `/orders/${orderId}`;
    if (onNavigateToSource) {
      onNavigateToSource(href);
    } else {
      window.dispatchEvent(
        new CustomEvent('huoyoupu:navigate', { detail: { href } })
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Sub Tabs: 客户与专属价 / 仓库管理 */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-default)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setCatalogTab('customers')}
          className={`btn btn-sm ${catalogTab === 'customers' ? 'btn-primary' : 'btn-secondary'}`}
        >
          客户档案与专属价
        </button>
        <button
          type="button"
          onClick={() => setCatalogTab('warehouses')}
          className={`btn btn-sm ${catalogTab === 'warehouses' ? 'btn-primary' : 'btn-secondary'}`}
        >
          仓库管理
        </button>
      </div>

      {catalogTab === 'warehouses' ? (
        <WarehouseListPage />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>客户档案与多地址</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                客户多配送地址共用统一资金账户，支持设置专属价、默认地址与历史成交价追溯
              </p>
            </div>

            <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
              <PlusIcon size={16} />
              <span>新建客户档案</span>
            </button>
          </div>

      {/* Search and Filters Bar */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <form
            onSubmit={e => {
              e.preventDefault();
              void loadCustomers(undefined, searchQuery);
            }}
            style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center', minWidth: '240px' }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
              <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: '32px' }}
                placeholder="搜索客户名称、编码、联系人或电话..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary">搜索</button>
          </form>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
            />
            <span>包含已停用客户</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
        <table className="table" style={{ width: '100%', minWidth: '350px' }}>
          <thead>
            <tr>
              <th>客户编码</th>
              <th>客户名称</th>
              <th>主联系人</th>
              <th>联系电话</th>
              <th>配送地址清单</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && customers.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>加载中...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>未找到客户资料</td></tr>
            ) : (
              customers.map(c => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600 }}>{c.code}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.notes}</div>}
                  </td>
                  <td>{c.contactName || '无'}</td>
                  <td>{c.phone || '无'}</td>
                  <td>
                    {c.addresses.length === 0 ? (
                      <span style={{ color: 'var(--text-subtle)', fontSize: '12px' }}>未录入地址</span>
                    ) : (
                      c.addresses.map(a => (
                        <div key={a.id} style={{ fontSize: '12px', marginBottom: '3px', opacity: a.active ? 1 : 0.6 }}>
                          <span className="badge badge-default" style={{ marginRight: '4px' }}>{a.label || '地址'}</span>
                          <span>{a.address}</span>
                          {a.isDefault && <span className="badge badge-success" style={{ marginLeft: '4px' }}>默认</span>}
                          {!a.active && <span className="badge badge-danger" style={{ marginLeft: '4px' }}>停用</span>}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {c.active ? <span className="badge badge-success">正常</span> : <span className="badge badge-danger">停用</span>}
                  </td>
                  <td className="text-right">
                    <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openEditModal(c)}
                        className="btn btn-secondary btn-sm"
                        title="编辑客户资料"
                      >
                        <EditIcon size={14} />
                        <span>编辑</span>
                      </button>
                      <button
                        onClick={() => openAddressModal(c)}
                        className="btn btn-secondary btn-sm"
                        title="维护多配送地址"
                      >
                        地址 ({c.addresses.length})
                      </button>
                      <button
                        onClick={() => void openPriceRulesModal(c)}
                        className="btn btn-secondary btn-sm"
                        title="维护客户专属价格规则"
                      >
                        专属价
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => void loadCustomers(nextCursor)} className="btn btn-secondary btn-sm" disabled={loading}>
            {loading ? '加载中...' : '加载更多客户'}
          </button>
        </div>
      )}

      {/* Create Customer Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>新建客户档案</span>
              <button onClick={() => setCreateModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {createError && (
                  <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    {createError}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>客户编码 *</label>
                  <input type="text" className="input" required value={code} onChange={e => setCode(e.target.value)} placeholder="如 KH-001" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>客户名称 *</label>
                  <input type="text" className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="如 朝阳第一便利店" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>主联系人</label>
                    <input type="text" className="input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="王店长" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>联系电话</label>
                    <input type="text" className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="13800000000" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>客户备注说明</label>
                  <input type="text" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="结款账期或特殊要求..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? '创建中...' : '确认创建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editModalOpen && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>编辑客户档案 - {selectedCustomer.code}</span>
              <button onClick={() => setEditModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <form onSubmit={handleSaveCustomer}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {editError && (
                  <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                    {editError}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>客户名称 *</label>
                  <input type="text" className="input" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>主联系人</label>
                    <input type="text" className="input" value={editContact} onChange={e => setEditContact(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>联系电话</label>
                    <input type="text" className="input" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>客户备注说明</label>
                  <input type="text" className="input" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
                <div style={{ paddingTop: '4px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={e => setEditActive(e.target.checked)}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>客户启用状态 (取消勾选即停用)</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setEditModalOpen(false)} className="btn btn-secondary">取消</button>
                <button type="submit" className="btn btn-primary" disabled={savingCustomer}>
                  {savingCustomer ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-address Management Modal */}
      {addressModalOpen && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-wide" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>管理客户多配送地址 - 【{selectedCustomer.name}】</span>
              <button onClick={() => setAddressModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {addrError && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                  {addrError}
                </div>
              )}

              {/* Editing Address Section (AddressPatch) */}
              {editingAddress && (
                <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm, 6px)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
                      修改配送地址 - (版本: v{editingAddress.version})
                    </span>
                    <button type="button" onClick={cancelEditAddress} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}>✕</button>
                  </div>
                  <form onSubmit={handleSaveEditAddress} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>地址标签</label>
                        <input
                          type="text"
                          className="input"
                          value={editAddrLabel}
                          onChange={e => setEditAddrLabel(e.target.value)}
                          placeholder="总店/分店"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>收件联系人 *</label>
                        <input
                          type="text"
                          className="input"
                          required
                          value={editAddrContact}
                          onChange={e => setEditAddrContact(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>联系电话</label>
                        <input
                          type="text"
                          className="input"
                          value={editAddrPhone}
                          onChange={e => setEditAddrPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>详细配送地址 *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        value={editAddrText}
                        onChange={e => setEditAddrText(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                      <button type="button" onClick={cancelEditAddress} className="btn btn-secondary btn-sm">
                        取消
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={savingAddrEdit || !editAddrContact.trim() || !editAddrText.trim()}
                      >
                        {savingAddrEdit ? '保存中...' : '保存地址修改'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Existing Address List */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>已有配送地址列表</div>
                <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="table" style={{ width: '100%', minWidth: '340px' }}>
                    <thead>
                      <tr>
                        <th>标签</th>
                        <th>收件人</th>
                        <th>联系电话</th>
                        <th>完整配送地址</th>
                        <th>状态</th>
                        <th>版本</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCustomer.addresses.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>
                            尚未录入任何配送地址
                          </td>
                        </tr>
                      ) : (
                        selectedCustomer.addresses.map(a => (
                          <tr key={a.id} style={{ opacity: a.active ? 1 : 0.6 }}>
                            <td>
                              <span className="badge badge-default">{a.label || '地址'}</span>
                              {a.isDefault && <span className="badge badge-success" style={{ marginLeft: '4px' }}>默认</span>}
                            </td>
                            <td style={{ fontWeight: 600 }}>{a.contactName}</td>
                            <td className="tabular-nums">{a.phone || '—'}</td>
                            <td>{a.address}</td>
                            <td>
                              {a.active ? <span className="badge badge-success">正常</span> : <span className="badge badge-danger">停用</span>}
                            </td>
                            <td className="tabular-nums text-muted" style={{ fontSize: '11px' }}>
                              v{a.version}
                            </td>
                            <td className="text-right">
                              <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => startEditAddress(a)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '12px' }}
                                >
                                  <EditIcon size={12} />
                                  <span>编辑</span>
                                </button>
                                {!a.isDefault && a.active && (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleAddressDefault(a)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '12px' }}
                                  >
                                    设为默认
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleToggleAddressActive(a)}
                                  className={`btn btn-sm ${a.active ? 'btn-ghost' : 'btn-secondary'}`}
                                  style={{ fontSize: '12px', color: a.active ? 'var(--danger)' : undefined }}
                                >
                                  {a.active ? '停用' : '恢复启用'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add New Address Form */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>新增配送地址</div>
                <form onSubmit={handleAddAddress} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>地址标签</label>
                      <input type="text" className="input" value={addrLabel} onChange={e => setAddrLabel(e.target.value)} placeholder="总店/分店" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>收件联系人 *</label>
                      <input type="text" className="input" required value={addrContact} onChange={e => setAddrContact(e.target.value)} placeholder="联系人" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>联系电话</label>
                      <input type="text" className="input" value={addrPhone} onChange={e => setAddrPhone(e.target.value)} placeholder="收件电话" />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>详细收货地址 *</label>
                    <input type="text" className="input" required value={addrText} onChange={e => setAddrText(e.target.value)} placeholder="省市区街道门牌号..." />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={addrIsDefault}
                        onChange={e => setAddrIsDefault(e.target.checked)}
                      />
                      <span>设为该客户开单首选默认配送地址</span>
                    </label>

                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingAddr}>
                      <PlusIcon size={14} />
                      <span>{savingAddr ? '保存中...' : '添加地址'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setAddressModalOpen(false)} className="btn btn-secondary">完成</button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Price Rules Modal */}
      {priceRulesModalOpen && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-wide" style={{ maxWidth: '680px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 600 }}>客户专属价格规则 - 【{selectedCustomer.name}】</span>
              <button onClick={closePriceRulesModal} className="btn btn-ghost btn-sm">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {ruleActionError && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '12px' }}>
                  {ruleActionError}
                </div>
              )}

              {/* Price hierarchy explanation & live quotation check */}
              <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm, 6px)', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, marginBottom: priceQuotePreview ? '8px' : 0 }}>
                  开单计价来源层级：<strong>历史成交价 &gt; 客户专属价 &gt; 单位默认售价</strong>
                </p>

                {quotePreviewLoading ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>正在试算当前商品单位价格来源...</div>
                ) : priceQuotePreview ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>当前执行单价：</span>
                      <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '15px', color: 'var(--accent)', marginLeft: '4px' }}>
                        ¥{priceQuotePreview.unitPrice}
                      </span>
                      <span
                        className="badge"
                        style={{
                          marginLeft: '8px',
                          background: priceQuotePreview.source === 'history' ? 'var(--info-bg, #e0f2fe)' : priceQuotePreview.source === 'customer_rule' ? 'var(--warning-bg, #fef3c7)' : 'var(--bg-default)',
                          color: 'var(--text-main)',
                        }}
                      >
                        {priceQuotePreview.source === 'history' ? '历史成交价 (最高优先级)' : priceQuotePreview.source === 'customer_rule' ? '客户专属合同价' : '商品默认售价'}
                      </span>
                    </div>

                    {priceQuotePreview.source === 'history' && priceQuotePreview.sourceOrderId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          来源单: <span className="font-mono">{priceQuotePreview.sourceOrderId}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleJumpToOrder(priceQuotePreview.sourceOrderId!, priceQuotePreview.sourceRevisionId)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          title="跳转查看对应来源订单"
                        >
                          查看来源订单
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Rules Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>已生效专属价格规则 ({priceRules.length})</div>
                  {priceRulesLoading && <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>正在同步所有分页规则...</span>}
                </div>
                <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
                  <table className="table" style={{ width: '100%', minWidth: '340px' }}>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>包装单位</th>
                        <th>专属单价 (元)</th>
                        <th>规则版本</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceRulesLoading && priceRules.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>加载专属价中...</td></tr>
                      ) : priceRules.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-subtle)' }}>尚未设置专属价格规则</td></tr>
                      ) : (
                        priceRules.map(rule => {
                          const prod = products.find(p => p.id === rule.productId);
                          const unit = prod?.units.find(u => u.id === rule.unitId);
                          return (
                            <tr key={`${rule.productId}-${rule.unitId}`}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{prod?.name || rule.productId}</div>
                                {prod?.specification && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{prod.specification}</div>}
                              </td>
                              <td>{unit?.name || rule.unitId}</td>
                              <td className="tabular-nums" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                ¥{rule.unitPrice}
                              </td>
                              <td style={{ fontSize: '11px' }}>v{rule.version}</td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  onClick={() => void handleDeletePriceRule(rule)}
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--danger)' }}
                                  title="撤销该专属价"
                                >
                                  <TrashIcon size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upsert Price Rule Form */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>新增或调整专属价规则</div>
                <form onSubmit={handleSavePriceRule} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>选择商品 *</label>
                    <select
                      className="select"
                      value={ruleProductId}
                      onChange={e => handleProductChange(e.target.value)}
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.specification ? `(${p.specification})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>包装销售单位 *</label>
                    <select
                      className="select"
                      value={ruleUnitId}
                      onChange={e => handleUnitChange(e.target.value)}
                    >
                      {products.find(p => p.id === ruleProductId)?.units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '2px' }}>专属单价 (元) *</label>
                    <input
                      type="text"
                      className="input tabular-nums"
                      required
                      value={rulePrice}
                      onChange={e => setRulePrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={savingRule} style={{ height: '34px' }}>
                    <span>{savingRule ? '保存中...' : '保存规则'}</span>
                  </button>
                </form>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={closePriceRulesModal} className="btn btn-secondary">完成</button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
