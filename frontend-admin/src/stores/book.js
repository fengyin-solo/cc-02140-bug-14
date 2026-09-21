import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { books as initialBooks } from '@/data/mockData'

// 导入本地封面图片
import hlmCover from '@/views/img/hlm.webp'
import jsCover from '@/views/img/js.webp'
import sgyyCover from '@/views/img/sgyy.webp'
import vueCover from '@/views/img/vue.jpeg'
import sjCover from '@/views/img/sj.webp'
import jjxCover from '@/views/img/jjx.webp'
import xlxCover from '@/views/img/xlx.webp'
import sxCover from '@/views/img/sx.webp'

const STORAGE_KEY = 'library_books'
const LOAD_DELAY = 400

// 默认书籍封面图片（使用本地图片）
const DEFAULT_COVERS = [
  hlmCover,
  jsCover,
  sgyyCover,
  vueCover,
  sjCover,
  jjxCover,
  xlxCover,
  sxCover
]

// 获取默认封面
function getDefaultCover(index) {
  return DEFAULT_COVERS[index % DEFAULT_COVERS.length]
}

// 检查并修复书籍封面
function fixBookCovers(books) {
  return books.map((book, index) => {
    // 如果封面是 SVG data URI、placeholder 或外部链接，则使用本地封面
    if (!book.cover || book.cover.includes('data:image/svg') || book.cover.includes('placeholder.com') || book.cover.startsWith('http')) {
      return {
        ...book,
        cover: getDefaultCover(index)
      }
    }
    return book
  })
}

export const useBookStore = defineStore('book', () => {
  const books = ref([])
  // idle / loading / success / error —— 空数据、加载中、加载失败需区分展示
  const status = ref('idle')
  const error = ref('')

  let loadPromise = null

  // 模拟异步数据加载（失败时保留现场，由页面触发重试）
  function loadFromStorage() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            const parsedBooks = JSON.parse(stored)
            if (!Array.isArray(parsedBooks)) throw new Error('图书数据格式错误')
            // 修复旧数据中的图片链接
            resolve(fixBookCovers(parsedBooks))
          } else {
            resolve([...initialBooks])
          }
        } catch (e) {
          reject(e)
        }
      }, LOAD_DELAY)
    })
  }

  async function fetchBooks(force = false) {
    if (!force && (status.value === 'loading' || status.value === 'success')) {
      return loadPromise
    }

    status.value = 'loading'
    error.value = ''

    loadPromise = loadFromStorage()
      .then(data => {
        books.value = data
        status.value = 'success'
        return data
      })
      .catch(e => {
        // 加载失败不清空既有数据，页面可从错误态点击重试
        error.value = e?.message || '图书数据加载失败'
        status.value = 'error'
        console.error('Failed to load books:', e)
        // 吞掉 rejection，由 status/error 驱动页面反馈；retry 时重新拉取
        return undefined
      })

    return loadPromise
  }

  // 首次进入即加载
  fetchBooks()

  // 仅在数据正常加载后持久化，避免失败重试期间用空数据覆盖本地记录
  watch(books, (newBooks) => {
    if (status.value === 'success') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks))
    }
  }, { deep: true })

  const totalBooks = computed(() => books.value.length)
  const totalAvailable = computed(() =>
    books.value.reduce((sum, book) => sum + book.available, 0)
  )

  function getBookById(id) {
    return books.value.find(book => book.id === id)
  }

  function addBook(book) {
    const newId = books.value.length > 0
      ? Math.max(...books.value.map(b => b.id)) + 1
      : 1
    books.value.push({ ...book, id: newId })
    return newId
  }

  function updateBook(id, data) {
    const index = books.value.findIndex(book => book.id === id)
    if (index !== -1) {
      books.value[index] = { ...books.value[index], ...data }
      return true
    }
    return false
  }

  function deleteBook(id) {
    const index = books.value.findIndex(book => book.id === id)
    if (index !== -1) {
      books.value.splice(index, 1)
      return true
    }
    return false
  }

  function searchBooks(keyword) {
    if (!keyword) return books.value
    const lowerKeyword = keyword.toLowerCase()
    return books.value.filter(book =>
      book.title.toLowerCase().includes(lowerKeyword) ||
      book.author.toLowerCase().includes(lowerKeyword) ||
      book.isbn.includes(keyword)
    )
  }

  function filterByCategory(categoryId) {
    if (!categoryId) return books.value
    return books.value.filter(book => book.categoryId === categoryId)
  }

  return {
    books,
    status,
    error,
    totalBooks,
    totalAvailable,
    fetchBooks,
    getBookById,
    addBook,
    updateBook,
    deleteBook,
    searchBooks,
    filterByCategory
  }
})
